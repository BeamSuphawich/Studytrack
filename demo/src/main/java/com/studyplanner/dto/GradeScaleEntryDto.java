package com.studyplanner.dto;

/** One entry of a course's grade scale: { letter, minPercent }. */
public record GradeScaleEntryDto(String letter, Double minPercent) {
}
