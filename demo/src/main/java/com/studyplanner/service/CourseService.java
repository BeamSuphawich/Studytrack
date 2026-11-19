package com.studyplanner.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.studyplanner.dto.CourseDto;
import com.studyplanner.dto.CourseRequest;
import com.studyplanner.dto.GradeScaleEntryDto;
import com.studyplanner.entity.Course;
import com.studyplanner.entity.GradeScaleEntry;
import com.studyplanner.exception.ApiException;
import com.studyplanner.repository.CourseRepository;
import com.studyplanner.repository.UserRepository;
import com.studyplanner.security.CurrentUser;

/**
 * Courses and their grade scales. Every method works only on the logged-in user's courses;
 * a course of another user answers 404 (same as a missing one).
 * Validation messages match js/api.js (and the frontend forms).
 */
@Service
public class CourseService {

	private static final String SCALE_ERROR = "Please fix the grade scale.";

	private final CourseRepository courses;
	private final UserRepository users;
	private final CurrentUser currentUser;

	public CourseService(CourseRepository courses, UserRepository users, CurrentUser currentUser) {
		this.courses = courses;
		this.users = users;
		this.currentUser = currentUser;
	}

	@Transactional(readOnly = true)
	public List<CourseDto> list() {
		return courses.findByUserIdOrderByIdAsc(currentUser.id()).stream().map(CourseService::toDto).toList();
	}

	/** New course with the default grade scale, or the given one (validated). */
	@Transactional
	public CourseDto create(CourseRequest body) {
		Long userId = currentUser.id();
		Fields fields = validateFields(body, userId, null);
		List<GradeScaleEntry> scale = body.gradeScale() == null ? GradeScales.defaultEntries() : validateScale(body.gradeScale());

		Course course = new Course();
		course.setUser(users.getReferenceById(userId));
		apply(course, fields);
		course.setGradeScale(scale);
		return toDto(courses.save(course));
	}

	/** Changes code, name, instructor and credits. Never changes the grade scale. */
	@Transactional
	public CourseDto update(Long id, CourseRequest body) {
		Long userId = currentUser.id();
		Course course = find(id, userId);
		apply(course, validateFields(body, userId, course.getId()));
		return toDto(course);
	}

	/** Replaces the whole grade scale (8 entries, A to F). */
	@Transactional
	public CourseDto updateGradeScale(Long id, List<GradeScaleEntryDto> scale) {
		Course course = find(id, currentUser.id());
		course.setGradeScale(validateScale(scale));
		return toDto(courses.saveAndFlush(course));
	}

	/** The database removes the course's grade scale, tasks and grade items (ON DELETE CASCADE). */
	@Transactional
	public void delete(Long id) {
		courses.delete(find(id, currentUser.id()));
	}

	/** Used by tasks and grade items to check that a course belongs to the current user. */
	Course find(Long id, Long userId) {
		if (id == null) {
			throw ApiException.notFound("Course");
		}
		return courses.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Course"));
	}

	// ---------- validation ----------

	private record Fields(String code, String name, String instructor, int credits) {
	}

	private Fields validateFields(CourseRequest body, Long userId, Long ownId) {
		String code = trim(body.code()).toUpperCase(Locale.ROOT);
		String name = trim(body.name());
		String instructor = trim(body.instructor());
		Integer credits = body.credits();

		Map<String, String> errors = new LinkedHashMap<>();
		if (code.isEmpty()) {
			errors.put("code", "Enter a course code.");
		} else if (code.length() > 20) {
			errors.put("code", "Course code must be 20 characters or fewer.");
		} else if (ownId == null ? courses.existsByUserIdAndCode(userId, code)
				: courses.existsByUserIdAndCodeAndIdNot(userId, code, ownId)) {
			errors.put("code", "You already have a course with this code.");
		}
		if (name.isEmpty()) {
			errors.put("name", "Enter a course name.");
		} else if (name.length() > 100) {
			errors.put("name", "Course name must be 100 characters or fewer.");
		}
		if (instructor.length() > 100) {
			errors.put("instructor", "Instructor must be 100 characters or fewer.");
		}
		if (credits == null || credits < 1 || credits > 6) {
			errors.put("credits", "Credits must be 1–6.");
		}
		if (!errors.isEmpty()) {
			throw ApiException.badRequest(errors);
		}
		return new Fields(code, name, instructor, credits);
	}

	/**
	 * Same rules as App.validateGradeScale / cleanGradeScale in the frontend:
	 * exactly A, B+, B, C+, C, D+, D, F in this order; 0–100; strictly decreasing; D above 0; F = 0.
	 * Errors are keyed by letter (e.g. "B+"), like the fields of the Edit grade scale modal.
	 */
	static List<GradeScaleEntry> validateScale(List<GradeScaleEntryDto> scale) {
		List<String> letters = GradeScales.LETTERS;
		boolean shapeOk = scale != null && scale.size() == letters.size();
		for (int i = 0; shapeOk && i < letters.size(); i++) {
			shapeOk = scale.get(i) != null && letters.get(i).equals(scale.get(i).letter());
		}
		if (!shapeOk) {
			throw ApiException.badRequest(SCALE_ERROR,
					Map.of("gradeScale", "Grade scale must list " + String.join(", ", letters) + " in this order."));
		}

		Map<String, String> errors = new LinkedHashMap<>();
		int last = letters.size() - 1;
		for (int i = 0; i <= last; i++) {
			String letter = letters.get(i);
			Double value = scale.get(i).minPercent();
			if (i == last) {
				if (value == null || value != 0) {
					errors.put(letter, letter + " must start at 0.");
				}
				continue;
			}
			Double above = i > 0 ? scale.get(i - 1).minPercent() : null;
			if (!Numbers.isFinite(value) || value < 0 || value > 100) {
				errors.put(letter, "Must be between 0 and 100.");
			} else if (Numbers.isFinite(above) && value >= above) {
				errors.put(letter, "Must be lower than " + letters.get(i - 1) + ".");
			} else if (i == last - 1 && value <= 0) {
				errors.put(letter, "Must be above 0.");
			}
		}
		if (!errors.isEmpty()) {
			throw ApiException.badRequest(SCALE_ERROR, errors);
		}

		List<GradeScaleEntry> entries = new ArrayList<>();
		for (int i = 0; i <= last; i++) {
			BigDecimal min = i == last ? BigDecimal.ZERO : Numbers.toDecimal(scale.get(i).minPercent());
			entries.add(new GradeScaleEntry(letters.get(i), min));
		}
		return entries;
	}

	// ---------- mapping ----------

	private static void apply(Course course, Fields f) {
		course.setCode(f.code());
		course.setName(f.name());
		course.setInstructor(f.instructor());
		course.setCredits(f.credits());
	}

	private static String trim(String s) {
		return s == null ? "" : s.trim();
	}

	static CourseDto toDto(Course c) {
		List<GradeScaleEntryDto> scale = c.getGradeScale().stream()
				.sorted((a, b) -> b.getMinPercent().compareTo(a.getMinPercent()))
				.map(e -> new GradeScaleEntryDto(e.getLetter(), Numbers.toDouble(e.getMinPercent())))
				.toList();
		return new CourseDto(c.getId(), c.getCode(), c.getName(), c.getInstructor(), c.getCredits(), scale);
	}
}
