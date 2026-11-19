package com.studyplanner.dto;

/** POST /api/auth/login body. Missing values simply fail as "Incorrect email or password." */
public record LoginRequest(String email, String password) {
}
