package com.studyplanner.dto;

import java.util.Map;

/**
 * Every API error has this shape (same as ApiError in js/api.js):
 * { "status": 400, "message": "...", "fieldErrors": { "fieldName": "message" } }.
 * fieldErrors is always present (empty when the error is not about a form field).
 */
public record ErrorResponse(int status, String message, Map<String, String> fieldErrors) {

	public ErrorResponse {
		fieldErrors = fieldErrors == null ? Map.of() : fieldErrors;
	}
}
