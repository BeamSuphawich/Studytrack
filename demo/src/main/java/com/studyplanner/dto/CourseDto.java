package com.studyplanner.dto;

import java.util.List;

/** Course as sent to the frontend: { id, code, name, instructor, credits, gradeScale: [{ letter, minPercent }] }. */
public record CourseDto(Long id, String code, String name, String instructor, Integer credits,
		List<GradeScaleEntryDto> gradeScale) {
}
