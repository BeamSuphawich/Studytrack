package com.studyplanner.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.studyplanner.dto.GradeItemDto;
import com.studyplanner.service.GradeItemService;

/**
 * GET    /api/courses/{courseId}/grade-items  -> 200 GradeItemDto[]
 * POST   /api/courses/{courseId}/grade-items  -> 201 GradeItemDto
 * PATCH  /api/grade-items/{id}                -> 200 GradeItemDto (only the fields sent; "score": null = not graded)
 * DELETE /api/grade-items/{id}                -> 204
 * Bodies are read as a map so PATCH can tell "score": null (clear) from a missing score (keep).
 */
@RestController
public class GradeItemController {

	private final GradeItemService gradeItems;

	public GradeItemController(GradeItemService gradeItems) {
		this.gradeItems = gradeItems;
	}

	@GetMapping("/api/courses/{courseId}/grade-items")
	public List<GradeItemDto> list(@PathVariable Long courseId) {
		return gradeItems.list(courseId);
	}

	@PostMapping("/api/courses/{courseId}/grade-items")
	@ResponseStatus(HttpStatus.CREATED)
	public GradeItemDto create(@PathVariable Long courseId, @RequestBody Map<String, Object> body) {
		return gradeItems.create(courseId, body);
	}

	@PatchMapping("/api/grade-items/{id}")
	public GradeItemDto patch(@PathVariable Long id, @RequestBody Map<String, Object> body) {
		return gradeItems.patch(id, body);
	}

	@DeleteMapping("/api/grade-items/{id}")
	public ResponseEntity<Void> delete(@PathVariable Long id) {
		gradeItems.delete(id);
		return ResponseEntity.noContent().build();
	}
}
