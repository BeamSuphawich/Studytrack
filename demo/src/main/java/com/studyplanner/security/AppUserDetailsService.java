package com.studyplanner.security;

import java.util.Locale;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.studyplanner.repository.UserRepository;

/** Loads a user by email for Spring Security's login check (BCrypt comparison is done by Spring). */
@Service
public class AppUserDetailsService implements UserDetailsService {

	private final UserRepository users;

	public AppUserDetailsService(UserRepository users) {
		this.users = users;
	}

	@Override
	public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
		String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
		return users.findByEmail(normalized)
				.map(u -> new AppUserPrincipal(u.getId(), u.getName(), u.getEmail(), u.getPasswordHash()))
				.orElseThrow(() -> new UsernameNotFoundException("No user with this email"));
	}
}
