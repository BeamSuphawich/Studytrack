package com.studyplanner.dto;

/** Task as sent to the frontend: { id, courseId, title, dueDate: "YYYY-MM-DD", status }. */
public record TaskDto(Long id, Long courseId, String title, String dueDate, String status) {
}
