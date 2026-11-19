package com.studyplanner.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.studyplanner.entity.GradeScaleEntry;

/** The default grade scale for new courses (same values as DEFAULT_GRADE_SCALE in js/app.js and js/api.js). */
public final class GradeScales {

	/** Fixed letters, highest first. Only minPercent can change; the last one (F) is always 0. */
	public static final List<String> LETTERS = List.of("A", "B+", "B", "C+", "C", "D+", "D", "F");

	private static final int[] DEFAULT_MIN = { 80, 75, 70, 65, 60, 55, 50, 0 };

	private GradeScales() {
	}

	/** A new, modifiable list (each course stores its own copy). */
	public static List<GradeScaleEntry> defaultEntries() {
		List<GradeScaleEntry> entries = new ArrayList<>();
		for (int i = 0; i < LETTERS.size(); i++) {
			entries.add(new GradeScaleEntry(LETTERS.get(i), BigDecimal.valueOf(DEFAULT_MIN[i])));
		}
		return entries;
	}
}
