package com.studyplanner.dto;

import java.util.List;

/**
 * POST /api/courses and PUT /api/courses/{id} body.
 * gradeScale is optional on POST (default scale when missing) and ignored on PUT
 * (the scale is changed only through PUT /api/courses/{id}/grade-scale).
 */
public record CourseRequest(String code, String name, String instructor, Integer credits,
		List<GradeScaleEntryDto> gradeScale) {
}
