package com.studyplanner.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.studyplanner.dto.LoginRequest;
import com.studyplanner.dto.RegisterRequest;
import com.studyplanner.dto.UserDto;
import com.studyplanner.service.AuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

/**
 * POST /api/auth/register  -> 201 UserDto (and logged in)
 * POST /api/auth/login     -> 200 UserDto, 401 wrong email/password
 * POST /api/auth/logout    -> 204
 * GET  /api/auth/me        -> 200 UserDto, 401 when not logged in
 * All POSTs need the CSRF header X-XSRF-TOKEN (value of the XSRF-TOKEN cookie).
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final AuthService auth;

	public AuthController(AuthService auth) {
		this.auth = auth;
	}

	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	public UserDto register(@Valid @RequestBody RegisterRequest body, HttpServletRequest request, HttpServletResponse response) {
		return auth.register(body, request, response);
	}

	@PostMapping("/login")
	public UserDto login(@RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
		return auth.login(body, request, response);
	}

	@PostMapping("/logout")
	public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
		auth.logout(request, response);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/me")
	public UserDto me() {
		return auth.me();
	}
}
