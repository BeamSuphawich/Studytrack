package com.studyplanner.dto;

/** PATCH /api/tasks/{id} body: { status }. */
public record TaskStatusRequest(String status) {
}
