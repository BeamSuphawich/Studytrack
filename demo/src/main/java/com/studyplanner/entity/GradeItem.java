package com.studyplanner.entity;

import java.math.BigDecimal;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * An assessment of a course. Only raw data is stored; the grade is calculated in the frontend.
 * score == null means "not graded yet" (never 0).
 */
@Entity
@Table(name = "grade_items")
public class GradeItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "course_id", nullable = false)
	private Course course;

	@Column(nullable = false, length = 100)
	private String name;

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.VARCHAR)
	@Column(nullable = false, length = 20)
	private GradeItemType type;

	@Column(precision = 10, scale = 2)
	private BigDecimal score;

	@Column(name = "max_score", nullable = false, precision = 10, scale = 2)
	private BigDecimal maxScore;

	@Column(nullable = false, precision = 5, scale = 2)
	private BigDecimal weight;

	public Long getId() { return id; }

	public Course getCourse() { return course; }
	public void setCourse(Course course) { this.course = course; }

	public String getName() { return name; }
	public void setName(String name) { this.name = name; }

	public GradeItemType getType() { return type; }
	public void setType(GradeItemType type) { this.type = type; }

	public BigDecimal getScore() { return score; }
	public void setScore(BigDecimal score) { this.score = score; }

	public BigDecimal getMaxScore() { return maxScore; }
	public void setMaxScore(BigDecimal maxScore) { this.maxScore = maxScore; }

	public BigDecimal getWeight() { return weight; }
	public void setWeight(BigDecimal weight) { this.weight = weight; }
}
