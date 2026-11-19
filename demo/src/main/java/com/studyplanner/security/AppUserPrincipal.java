package com.studyplanner.security;

import java.util.Collection;
import java.util.List;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** The logged-in user kept in the session. Holds the user id so every query can filter by owner. */
public class AppUserPrincipal implements UserDetails, CredentialsContainer {

	private static final long serialVersionUID = 1L;

	private final Long id;
	private final String name;
	private final String email;
	private String passwordHash;

	public AppUserPrincipal(Long id, String name, String email, String passwordHash) {
		this.id = id;
		this.name = name;
		this.email = email;
		this.passwordHash = passwordHash;
	}

	public Long getId() { return id; }

	public String getName() { return name; }

	public String getEmail() { return email; }

	@Override
	public String getUsername() { return email; }

	@Override
	public String getPassword() { return passwordHash; }

	@Override
	public Collection<? extends GrantedAuthority> getAuthorities() {
		return List.of(new SimpleGrantedAuthority("ROLE_USER"));
	}

	/** Called after login so the hash is not kept in the session. */
	@Override
	public void eraseCredentials() {
		passwordHash = null;
	}
}
