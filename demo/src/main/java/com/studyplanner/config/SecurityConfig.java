package com.studyplanner.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.savedrequest.NullRequestCache;

import com.studyplanner.security.CsrfCookieFilter;
import com.studyplanner.security.JsonSecurityErrors;

/**
 * Security rules.
 * - Login state: a server session (JSESSIONID cookie, HttpOnly + SameSite=Lax, see application.properties). No JWT.
 * - Passwords: BCrypt.
 * - CSRF: ON for every POST/PUT/PATCH/DELETE (including login and register). The token is sent in the
 *   XSRF-TOKEN cookie (readable by JS, SameSite=Lax); the frontend must send it back in the X-XSRF-TOKEN header.
 * - Static pages are public (each page checks the login through js/api.js). /api/** needs a session,
 *   except register/login/logout. Errors are JSON: 401 when not logged in, 403 when the CSRF token is missing.
 */
@Configuration
public class SecurityConfig {

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	/** Keeps the logged-in user in the HTTP session (used by AuthService when logging in). */
	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	/** Checks email + password with AppUserDetailsService and the BCrypt PasswordEncoder above. */
	@Bean
	AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
		return config.getAuthenticationManager();
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository contextRepository) throws Exception {
		CookieCsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
		csrfTokens.setCookieCustomizer(cookie -> cookie.sameSite("Lax").path("/"));

		http
			.csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens))
			.addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
			.securityContext(context -> context.securityContextRepository(contextRepository))
			// No "remember the page and redirect after login": the API just answers 401, so don't create a session for it.
			.requestCache(cache -> cache.requestCache(new NullRequestCache()))
			.authorizeHttpRequests(auth -> auth
				.requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/logout").permitAll()
				.requestMatchers("/api/**").authenticated()
				.anyRequest().permitAll())
			.exceptionHandling(ex -> ex
				.authenticationEntryPoint(JsonSecurityErrors::unauthorized)
				.accessDeniedHandler(JsonSecurityErrors::forbidden))
			.formLogin(AbstractHttpConfigurer::disable)
			.httpBasic(AbstractHttpConfigurer::disable)
			.logout(AbstractHttpConfigurer::disable); // POST /api/auth/logout is handled by AuthController
		return http.build();
	}
}
