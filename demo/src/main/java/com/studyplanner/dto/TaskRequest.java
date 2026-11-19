package com.studyplanner.dto;

/**
 * POST /api/tasks and PUT /api/tasks/{id} body: { title, courseId, dueDate: "YYYY-MM-DD", status }.
 * dueDate and status are strings so wrong values get a field error instead of a parse error.
 * status is optional on POST (defaults to "To Do").
 */
public record TaskRequest(String title, Long courseId, String dueDate, String status) {
}
