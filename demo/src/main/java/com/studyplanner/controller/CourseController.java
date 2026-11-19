package com.studyplanner.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.studyplanner.dto.CourseDto;
import com.studyplanner.dto.CourseRequest;
import com.studyplanner.dto.GradeScaleEntryDto;
import com.studyplanner.service.CourseService;

/**
 * GET    /api/courses                     -> 200 CourseDto[]
 * POST   /api/courses                     -> 201 CourseDto (400 field errors)
 * PUT    /api/courses/{id}                -> 200 CourseDto (never changes the grade scale)
 * PUT    /api/courses/{id}/grade-scale    -> 200 CourseDto (body: [{ letter, minPercent }] x 8)
 * DELETE /api/courses/{id}                -> 204 (also deletes its tasks, grade items and grade scale)
 */
@RestController
@RequestMapping("/api/courses")
public class CourseController {

	private final CourseService courses;

	public CourseController(CourseService courses) {
		this.courses = courses;
	}

	@GetMapping
	public List<CourseDto> list() {
		return courses.list();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public CourseDto create(@RequestBody CourseRequest body) {
		return courses.create(body);
	}

	@PutMapping("/{id}")
	public CourseDto update(@PathVariable Long id, @RequestBody CourseRequest body) {
		return courses.update(id, body);
	}

	@PutMapping("/{id}/grade-scale")
	public CourseDto updateGradeScale(@PathVariable Long id, @RequestBody List<GradeScaleEntryDto> gradeScale) {
		return courses.updateGradeScale(id, gradeScale);
	}

	@DeleteMapping("/{id}")
	public ResponseEntity<Void> delete(@PathVariable Long id) {
		courses.delete(id);
		return ResponseEntity.noContent().build();
	}
}
