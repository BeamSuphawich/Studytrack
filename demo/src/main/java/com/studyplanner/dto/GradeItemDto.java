package com.studyplanner.dto;

/** Assessment as sent to the frontend: { id, courseId, name, type, score (null = not graded), maxScore, weight }. */
public record GradeItemDto(Long id, Long courseId, String name, String type, Double score, Double maxScore,
		Double weight) {
}
