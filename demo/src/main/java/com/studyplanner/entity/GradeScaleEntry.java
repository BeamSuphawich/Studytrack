package com.studyplanner.entity;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** One letter grade of a course's grade scale, e.g. { A, 80.00 }. Stored in course_grade_scale. */
@Embeddable
public class GradeScaleEntry {

	@Column(nullable = false, length = 2)
	private String letter;

	@Column(name = "min_percent", nullable = false, precision = 5, scale = 2)
	private BigDecimal minPercent;

	protected GradeScaleEntry() {
	}

	public GradeScaleEntry(String letter, BigDecimal minPercent) {
		this.letter = letter;
		this.minPercent = minPercent;
	}

	public String getLetter() { return letter; }

	public BigDecimal getMinPercent() { return minPercent; }
}
