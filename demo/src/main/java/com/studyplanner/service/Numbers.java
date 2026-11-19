package com.studyplanner.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Converts between JSON numbers (Double) and database DECIMAL(…, 2) values (BigDecimal). */
final class Numbers {

	private Numbers() {
	}

	/** Stored with 2 decimals (DECIMAL(…, 2)); more decimals are rounded half up. */
	static BigDecimal toDecimal(Double value) {
		return value == null ? null : BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
	}

	/** 85.00 -> 85.0 in JSON (a plain number for js). */
	static Double toDouble(BigDecimal value) {
		return value == null ? null : value.doubleValue();
	}

	static boolean isFinite(Double value) {
		return value != null && !value.isNaN() && !value.isInfinite();
	}
}
