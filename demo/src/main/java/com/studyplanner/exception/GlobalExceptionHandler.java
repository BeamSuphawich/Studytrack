package com.studyplanner.exception;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.studyplanner.dto.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;

/** Turns every error into the JSON shape { status, message, fieldErrors } that js/api.js expects. */
@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(ApiException.class)
	ResponseEntity<ErrorResponse> handleApi(ApiException ex) {
		return build(ex.getStatus(), ex.getMessage(), ex.getFieldErrors());
	}

	/** Bean Validation on request bodies: one message per field (the first one found). */
	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
		Map<String, String> fieldErrors = new LinkedHashMap<>();
		ex.getBindingResult().getFieldErrors()
				.forEach(err -> fieldErrors.putIfAbsent(err.getField(), err.getDefaultMessage()));
		return build(HttpStatus.BAD_REQUEST, "Please fix the highlighted fields.", fieldErrors);
	}

	@ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class })
	ResponseEntity<ErrorResponse> handleUnreadable(Exception ex) {
		return build(HttpStatus.BAD_REQUEST, "The request is not valid JSON or has a value of the wrong type.", null);
	}

	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	ResponseEntity<ErrorResponse> handleMethod(HttpRequestMethodNotSupportedException ex) {
		return build(HttpStatus.METHOD_NOT_ALLOWED, "This method is not allowed here.", null);
	}

	/** Unknown /api/... path: JSON 404. Other paths (static files) keep Spring's default 404. */
	@ExceptionHandler(NoResourceFoundException.class)
	ResponseEntity<ErrorResponse> handleNoResource(NoResourceFoundException ex, HttpServletRequest request)
			throws NoResourceFoundException {
		if (!request.getRequestURI().startsWith("/api/")) {
			throw ex;
		}
		return build(HttpStatus.NOT_FOUND, "Not found.", null);
	}

	/** A database constraint caught something the service did not (e.g. two requests at the same time). */
	@ExceptionHandler(DataIntegrityViolationException.class)
	ResponseEntity<ErrorResponse> handleIntegrity(DataIntegrityViolationException ex) {
		log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
		return build(HttpStatus.CONFLICT, "This conflicts with existing data. Reload and try again.", null);
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<ErrorResponse> handleOther(Exception ex) {
		log.error("Unexpected error", ex);
		return build(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.", null);
	}

	private static ResponseEntity<ErrorResponse> build(HttpStatus status, String message, Map<String, String> fieldErrors) {
		return ResponseEntity.status(status).body(new ErrorResponse(status.value(), message, fieldErrors));
	}
}
