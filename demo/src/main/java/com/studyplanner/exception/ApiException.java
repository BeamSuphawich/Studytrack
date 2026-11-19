package com.studyplanner.exception;

import java.util.Map;

import org.springframework.http.HttpStatus;

/** Thrown by services; GlobalExceptionHandler turns it into an ErrorResponse with the given status. */
public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final Map<String, String> fieldErrors;

	public ApiException(HttpStatus status, String message, Map<String, String> fieldErrors) {
		super(message);
		this.status = status;
		this.fieldErrors = fieldErrors == null ? Map.of() : Map.copyOf(fieldErrors);
	}

	public static ApiException badRequest(Map<String, String> fieldErrors) {
		return badRequest("Please fix the highlighted fields.", fieldErrors);
	}

	public static ApiException badRequest(String message, Map<String, String> fieldErrors) {
		return new ApiException(HttpStatus.BAD_REQUEST, message, fieldErrors);
	}

	public static ApiException unauthorized(String message, Map<String, String> fieldErrors) {
		return new ApiException(HttpStatus.UNAUTHORIZED, message, fieldErrors);
	}

	/** Used both for "does not exist" and "belongs to another user", so ids of other users are never revealed. */
	public static ApiException notFound(String what) {
		return new ApiException(HttpStatus.NOT_FOUND, what + " not found.", null);
	}

	public static ApiException conflict(String field, String message) {
		return new ApiException(HttpStatus.CONFLICT, message, Map.of(field, message));
	}

	public HttpStatus getStatus() { return status; }

	public Map<String, String> getFieldErrors() { return fieldErrors; }
}
