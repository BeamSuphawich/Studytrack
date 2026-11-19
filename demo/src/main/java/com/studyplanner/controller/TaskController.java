package com.studyplanner.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.studyplanner.dto.TaskDto;
import com.studyplanner.dto.TaskRequest;
import com.studyplanner.dto.TaskStatusRequest;
import com.studyplanner.service.TaskService;

/**
 * GET    /api/tasks        -> 200 TaskDto[] (sorted by due date)
 * POST   /api/tasks        -> 201 TaskDto
 * PUT    /api/tasks/{id}   -> 200 TaskDto (title, courseId, dueDate, status)
 * PATCH  /api/tasks/{id}   -> 200 TaskDto (body: { status })
 * DELETE /api/tasks/{id}   -> 204
 */
@RestController
@RequestMapping("/api/tasks")
public class TaskController {

	private final TaskService tasks;

	public TaskController(TaskService tasks) {
		this.tasks = tasks;
	}

	@GetMapping
	public List<TaskDto> list() {
		return tasks.list();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public TaskDto create(@RequestBody TaskRequest body) {
		return tasks.create(body);
	}

	@PutMapping("/{id}")
	public TaskDto update(@PathVariable Long id, @RequestBody TaskRequest body) {
		return tasks.update(id, body);
	}

	@PatchMapping("/{id}")
	public TaskDto updateStatus(@PathVariable Long id, @RequestBody TaskStatusRequest body) {
		return tasks.updateStatus(id, body.status());
	}

	@DeleteMapping("/{id}")
	public ResponseEntity<Void> delete(@PathVariable Long id) {
		tasks.delete(id);
		return ResponseEntity.noContent().build();
	}
}
