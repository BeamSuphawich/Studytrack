package com.studyplanner.service;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.studyplanner.dto.LoginRequest;
import com.studyplanner.dto.RegisterRequest;
import com.studyplanner.dto.UserDto;
import com.studyplanner.entity.User;
import com.studyplanner.exception.ApiException;
import com.studyplanner.repository.UserRepository;
import com.studyplanner.security.AppUserPrincipal;
import com.studyplanner.security.CurrentUser;
import com.studyplanner.security.JsonSecurityErrors;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Register, login, logout and "who am I", using a server session (Spring Security). */
@Service
public class AuthService {

	static final String WRONG_LOGIN = "Incorrect email or password.";
	/** BCrypt only uses the first 72 bytes of a password; longer ones are rejected instead of silently cut. */
	private static final int MAX_PASSWORD_BYTES = 72;

	private final UserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final AuthenticationManager authenticationManager;
	private final SecurityContextRepository contextRepository;
	private final SampleDataService sampleData;
	private final CurrentUser currentUser;

	public AuthService(UserRepository users, PasswordEncoder passwordEncoder, AuthenticationManager authenticationManager,
			SecurityContextRepository contextRepository, SampleDataService sampleData, CurrentUser currentUser) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.authenticationManager = authenticationManager;
		this.contextRepository = contextRepository;
		this.sampleData = sampleData;
		this.currentUser = currentUser;
	}

	/** Creates the account (BCrypt hash), adds sample data if enabled, and logs the new user in. */
	@Transactional
	public UserDto register(RegisterRequest body, HttpServletRequest request, HttpServletResponse response) {
		String email = normalizeEmail(body.email());
		if (body.password().getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
			throw ApiException.badRequest(Map.of("password", "Password is too long."));
		}
		if (users.existsByEmail(email)) {
			throw ApiException.conflict("email", "An account with this email already exists.");
		}

		User user = new User();
		user.setName(body.name().trim());
		user.setEmail(email);
		user.setPasswordHash(passwordEncoder.encode(body.password()));
		users.save(user);
		sampleData.createFor(user);

		startSession(new AppUserPrincipal(user.getId(), user.getName(), user.getEmail(), null), request, response);
		return toDto(user);
	}

	/** Checks the password with Spring Security (BCrypt). Wrong email or password: 401 with a password field error. */
	public UserDto login(LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
		String email = normalizeEmail(body.email());
		String password = body.password() == null ? "" : body.password();
		Authentication result;
		try {
			result = authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, password));
		} catch (AuthenticationException ex) {
			throw ApiException.unauthorized(WRONG_LOGIN, Map.of("password", WRONG_LOGIN));
		}
		AppUserPrincipal principal = (AppUserPrincipal) result.getPrincipal();
		startSession(principal, request, response);
		return new UserDto(principal.getId(), principal.getName(), principal.getEmail());
	}

	/** Ends the session and removes the session cookie. Safe to call when already logged out. */
	public void logout(HttpServletRequest request, HttpServletResponse response) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		new SecurityContextLogoutHandler().logout(request, response, auth);
		new CookieClearingLogoutHandler("JSESSIONID").logout(request, response, auth);
	}

	/** The logged-in user, read fresh from the database. */
	@Transactional(readOnly = true)
	public UserDto me() {
		return users.findById(currentUser.id())
				.map(AuthService::toDto)
				.orElseThrow(() -> ApiException.unauthorized(JsonSecurityErrors.SESSION_ENDED, Map.of()));
	}

	/** Puts the user into a NEW session id (prevents session fixation) and saves it. */
	private void startSession(AppUserPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
		if (request.getSession(false) != null) {
			request.changeSessionId();
		}
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
		SecurityContextHolder.setContext(context);
		contextRepository.saveContext(context, request, response);
	}

	private static String normalizeEmail(String email) {
		return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
	}

	private static UserDto toDto(User user) {
		return new UserDto(user.getId(), user.getName(), user.getEmail());
	}
}
