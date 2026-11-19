package com.studyplanner.dto;

/** User as sent to the frontend: { id, name, email }. Never contains the password hash. */
public record UserDto(Long id, String name, String email) {
}
