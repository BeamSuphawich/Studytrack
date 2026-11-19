package com.studyplanner.service;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.studyplanner.dto.GradeItemDto;
import com.studyplanner.entity.Course;
import com.studyplanner.entity.GradeItem;
import com.studyplanner.entity.GradeItemType;
import com.studyplanner.exception.ApiException;
import com.studyplanner.repository.GradeItemRepository;
import com.studyplanner.security.CurrentUser;

/**
 * Assessments of a course. Only raw values are stored; the grade is calculated in the frontend.
 * Same rules as App.validateGradeItem / cleanGradeItem in the frontend:
 * name required, type COURSEWORK/MIDTERM/FINAL, maxScore > 0, 0 < weight <= 100,
 * score empty (null = not graded) or 0..maxScore. Invalid values are never saved.
 */
@Service
public class GradeItemService {

	/** Fields a PATCH may change. */
	private static final Set<String> PATCHABLE = Set.of("name", "type", "score", "maxScore", "weight");

	private final GradeItemRepository gradeItems;
	private final CourseService courseService;
	private final CurrentUser currentUser;

	public GradeItemService(GradeItemRepository gradeItems, CourseService courseService, CurrentUser currentUser) {
		this.gradeItems = gradeItems;
		this.courseService = courseService;
		this.currentUser = currentUser;
	}

	@Transactional(readOnly = true)
	public List<GradeItemDto> list(Long courseId) {
		Course course = courseService.find(courseId, currentUser.id());
		return gradeItems.findByCourseIdOrderByIdAsc(course.getId()).stream().map(GradeItemService::toDto).toList();
	}

	/** body: { name, type, score, maxScore, weight } (score may be null or missing). */
	@Transactional
	public GradeItemDto create(Long courseId, Map<String, Object> body) {
		Course course = courseService.find(courseId, currentUser.id());
		Valid values = validate(read(body, new Values(null, null, null, null, null)));
		GradeItem item = new GradeItem();
		item.setCourse(course);
		apply(item, values);
		return toDto(gradeItems.save(item));
	}

	/**
	 * PATCH: only the keys present in the body change. "score": null means "not graded yet".
	 * The merged result is validated as a whole (e.g. a new maxScore below the saved score is rejected).
	 */
	@Transactional
	public GradeItemDto patch(Long id, Map<String, Object> body) {
		GradeItem item = find(id);
		Values current = new Values(item.getName(), item.getType() == null ? null : item.getType().name(),
				Numbers.toDouble(item.getScore()), Numbers.toDouble(item.getMaxScore()), Numbers.toDouble(item.getWeight()));
		apply(item, validate(read(body, current)));
		return toDto(item);
	}

	@Transactional
	public void delete(Long id) {
		gradeItems.delete(find(id));
	}

	private GradeItem find(Long id) {
		return gradeItems.findByIdAndCourseUserId(id, currentUser.id()).orElseThrow(() -> ApiException.notFound("Assessment"));
	}

	// ---------- reading the JSON body ----------

	/** Raw values; numbers are null when missing. NaN marks "present but not a number". */
	private record Values(String name, String type, Double score, Double maxScore, Double weight) {
	}

	private static Values read(Map<String, Object> body, Values base) {
		if (body == null) {
			body = Map.of();
		}
		String name = base.name();
		String type = base.type();
		Double score = base.score();
		Double maxScore = base.maxScore();
		Double weight = base.weight();
		for (Map.Entry<String, Object> e : body.entrySet()) {
			if (!PATCHABLE.contains(e.getKey())) {
				continue;
			}
			Object v = e.getValue();
			switch (e.getKey()) {
				case "name" -> name = v == null ? null : String.valueOf(v);
				case "type" -> type = v == null ? null : String.valueOf(v);
				case "score" -> score = number(v);
				case "maxScore" -> maxScore = number(v);
				case "weight" -> weight = number(v);
				default -> { }
			}
		}
		return new Values(name, type, score, maxScore, weight);
	}

	/** JSON number -> Double; null/"" -> null; anything else -> NaN (reported as "not a number"). */
	private static Double number(Object v) {
		if (v == null || (v instanceof String s && s.isBlank())) {
			return null;
		}
		if (v instanceof Number n) {
			return n.doubleValue();
		}
		if (v instanceof String s) {
			try {
				return Double.valueOf(s.trim());
			} catch (NumberFormatException ex) {
				return Double.NaN;
			}
		}
		return Double.NaN;
	}

	// ---------- validation ----------

	private record Valid(String name, GradeItemType type, BigDecimal score, BigDecimal maxScore, BigDecimal weight) {
	}

	private static Valid validate(Values v) {
		String name = v.name() == null ? "" : v.name().trim();
		GradeItemType type = parseType(v.type());
		Map<String, String> errors = new LinkedHashMap<>();

		if (name.isEmpty()) {
			errors.put("name", "Enter a name.");
		} else if (name.length() > 100) {
			errors.put("name", "Name must be 100 characters or fewer.");
		}
		if (type == null) {
			errors.put("type", "Choose a type.");
		}
		boolean maxOk = Numbers.isFinite(v.maxScore()) && v.maxScore() > 0 && v.maxScore() < 1e8;
		if (!maxOk) {
			errors.put("maxScore", "Max score must be greater than 0.");
		}
		if (!Numbers.isFinite(v.weight()) || v.weight() <= 0 || v.weight() > 100) {
			errors.put("weight", "Weight must be more than 0 and at most 100%.");
		}
		if (v.score() != null) {
			if (!Numbers.isFinite(v.score()) || v.score() < 0) {
				errors.put("score", "Score can’t be negative.");
			} else if (maxOk && Numbers.toDecimal(v.score()).compareTo(Numbers.toDecimal(v.maxScore())) > 0) {
				errors.put("score", "Score can’t be higher than the max score.");
			}
		}
		if (!errors.isEmpty()) {
			throw ApiException.badRequest(errors);
		}
		return new Valid(name, type, Numbers.toDecimal(v.score()), Numbers.toDecimal(v.maxScore()), Numbers.toDecimal(v.weight()));
	}

	private static GradeItemType parseType(String value) {
		if (value == null) {
			return null;
		}
		try {
			return GradeItemType.valueOf(value);
		} catch (IllegalArgumentException ex) {
			return null;
		}
	}

	// ---------- mapping ----------

	private static void apply(GradeItem item, Valid v) {
		item.setName(v.name());
		item.setType(v.type());
		item.setScore(v.score());
		item.setMaxScore(v.maxScore());
		item.setWeight(v.weight());
	}

	static GradeItemDto toDto(GradeItem g) {
		return new GradeItemDto(g.getId(), g.getCourse().getId(), g.getName(), g.getType().name(),
				Numbers.toDouble(g.getScore()), Numbers.toDouble(g.getMaxScore()), Numbers.toDouble(g.getWeight()));
	}
}
