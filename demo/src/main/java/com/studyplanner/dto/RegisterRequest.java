package com.studyplanner.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** POST /api/auth/register body. Messages match the frontend form errors. */
public record RegisterRequest(
		@NotBlank(message = "Enter your full name.")
		@Size(max = 100, message = "Name must be 100 characters or fewer.")
		String name,

		@NotNull(message = "Enter a valid email address.")
		@Pattern(regexp = "^\\s*\\S+@\\S+\\.\\S+\\s*$", message = "Enter a valid email address.")
		@Size(max = 255, message = "Email must be 255 characters or fewer.")
		String email,

		@NotNull(message = "Password must be at least 8 characters.")
		@Size(min = 8, message = "Password must be at least 8 characters.")
		String password) {
}
