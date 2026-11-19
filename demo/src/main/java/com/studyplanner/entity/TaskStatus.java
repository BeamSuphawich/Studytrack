package com.studyplanner.entity;

/** Stored task status. "Overdue" is not a status: the frontend derives it from the due date. */
public enum TaskStatus {
	TODO, IN_PROGRESS, DONE
}
