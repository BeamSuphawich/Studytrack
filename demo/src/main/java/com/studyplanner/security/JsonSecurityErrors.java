package com.studyplanner.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.csrf.CsrfException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * JSON bodies for errors raised by Spring Security itself (before any controller runs),
 * in the same { status, message, fieldErrors } shape as GlobalExceptionHandler.
 */
public final class JsonSecurityErrors {

	public static final String SESSION_ENDED = "Your session has ended. Please log in again.";
	static final String CSRF_INVALID = "Missing or invalid CSRF token. Reload the page and try again.";
	static final String FORBIDDEN = "You don't have access to this.";

	private JsonSecurityErrors() {
	}

	/** Not logged in (or session expired) on a protected /api endpoint: 401. */
	public static void unauthorized(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
			throws IOException {
		write(response, HttpStatus.UNAUTHORIZED, SESSION_ENDED);
	}

	/** Missing / wrong CSRF token, or no permission: 403. */
	public static void forbidden(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
			throws IOException {
		write(response, HttpStatus.FORBIDDEN, ex instanceof CsrfException ? CSRF_INVALID : FORBIDDEN);
	}

	/** Messages are fixed constants (no user input), so simple escaping is enough. */
	private static void write(HttpServletResponse response, HttpStatus status, String message) throws IOException {
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		String safe = message.replace("\\", "\\\\").replace("\"", "\\\"");
		response.getWriter().write("{\"status\":" + status.value() + ",\"message\":\"" + safe + "\",\"fieldErrors\":{}}");
	}
}
