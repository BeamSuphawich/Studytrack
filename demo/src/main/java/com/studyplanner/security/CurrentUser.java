package com.studyplanner.security;

import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.studyplanner.exception.ApiException;

/** Gives services the id of the logged-in user. Every query uses it, so users only see their own data. */
@Component
public class CurrentUser {

	public Long id() {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (auth != null && auth.getPrincipal() instanceof AppUserPrincipal principal) {
			return principal.getId();
		}
		throw ApiException.unauthorized(JsonSecurityErrors.SESSION_ENDED, Map.of());
	}
}
