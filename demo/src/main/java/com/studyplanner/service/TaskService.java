package com.studyplanner.service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.studyplanner.dto.TaskDto;
import com.studyplanner.dto.TaskRequest;
import com.studyplanner.entity.Course;
import com.studyplanner.entity.Task;
import com.studyplanner.entity.TaskStatus;
import com.studyplanner.exception.ApiException;
import com.studyplanner.repository.CourseRepository;
import com.studyplanner.repository.TaskRepository;
import com.studyplanner.security.CurrentUser;

/**
 * Tasks of the logged-in user (owner = the task's course's user). Other users' tasks answer 404.
 * Validation messages match js/api.js. "Overdue" is not stored; the frontend derives it.
 */
@Service
public class TaskService {

	private static final String BAD_STATUS = "Choose a valid status.";

	private final TaskRepository tasks;
	private final CourseRepository courses;
	private final CurrentUser currentUser;

	public TaskService(TaskRepository tasks, CourseRepository courses, CurrentUser currentUser) {
		this.tasks = tasks;
		this.courses = courses;
		this.currentUser = currentUser;
	}

	/** All tasks, sorted by due date (then id). */
	@Transactional(readOnly = true)
	public List<TaskDto> list() {
		return tasks.findByCourseUserIdOrderByDueDateAscIdAsc(currentUser.id()).stream().map(TaskService::toDto).toList();
	}

	@Transactional
	public TaskDto create(TaskRequest body) {
		Long userId = currentUser.id();
		Task task = new Task();
		apply(task, validate(body, userId, TaskStatus.TODO));
		return toDto(tasks.save(task));
	}

	/** Full update (PUT): title, courseId, dueDate, status. */
	@Transactional
	public TaskDto update(Long id, TaskRequest body) {
		Long userId = currentUser.id();
		Task task = find(id, userId);
		apply(task, validate(body, userId, task.getStatus()));
		return toDto(task);
	}

	/** PATCH: status only. */
	@Transactional
	public TaskDto updateStatus(Long id, String status) {
		Task task = find(id, currentUser.id());
		TaskStatus parsed = parseStatus(status);
		if (parsed == null) {
			throw ApiException.badRequest(Map.of("status", BAD_STATUS));
		}
		task.setStatus(parsed);
		return toDto(task);
	}

	@Transactional
	public void delete(Long id) {
		tasks.delete(find(id, currentUser.id()));
	}

	private Task find(Long id, Long userId) {
		return tasks.findByIdAndCourseUserId(id, userId).orElseThrow(() -> ApiException.notFound("Task"));
	}

	// ---------- validation ----------

	private record Fields(String title, Course course, LocalDate dueDate, TaskStatus status) {
	}

	private Fields validate(TaskRequest body, Long userId, TaskStatus defaultStatus) {
		String title = body.title() == null ? "" : body.title().trim();
		Course course = body.courseId() == null ? null : courses.findByIdAndUserId(body.courseId(), userId).orElse(null);
		LocalDate due = parseDate(body.dueDate());
		TaskStatus status = body.status() == null ? defaultStatus : parseStatus(body.status());

		Map<String, String> errors = new LinkedHashMap<>();
		if (title.isEmpty()) {
			errors.put("title", "Enter a task title.");
		} else if (title.length() > 200) {
			errors.put("title", "Task title must be 200 characters or fewer.");
		}
		if (course == null) {
			errors.put("courseId", "Choose a course."); // also when the course belongs to someone else
		}
		if (due == null) {
			errors.put("dueDate", "Pick a due date.");
		}
		if (status == null) {
			errors.put("status", BAD_STATUS);
		}
		if (!errors.isEmpty()) {
			throw ApiException.badRequest(errors);
		}
		return new Fields(title, course, due, status);
	}

	/** Accepts "YYYY-MM-DD" (or a date-time, of which only the date is used). Invalid dates give null. */
	private static LocalDate parseDate(String value) {
		if (value == null || value.length() < 10) {
			return null;
		}
		try {
			return LocalDate.parse(value.substring(0, 10));
		} catch (DateTimeParseException ex) {
			return null;
		}
	}

	private static TaskStatus parseStatus(String value) {
		if (value == null) {
			return null;
		}
		try {
			return TaskStatus.valueOf(value);
		} catch (IllegalArgumentException ex) {
			return null;
		}
	}

	// ---------- mapping ----------

	private static void apply(Task task, Fields f) {
		task.setTitle(f.title());
		task.setCourse(f.course());
		task.setDueDate(f.dueDate());
		task.setStatus(f.status());
	}

	static TaskDto toDto(Task t) {
		return new TaskDto(t.getId(), t.getCourse().getId(), t.getTitle(), t.getDueDate().toString(), t.getStatus().name());
	}
}
