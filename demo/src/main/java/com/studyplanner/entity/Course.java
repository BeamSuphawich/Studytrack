package com.studyplanner.entity;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

/** A course of one user. Tasks and grade items reference it and are deleted with it (ON DELETE CASCADE). */
@Entity
@Table(name = "courses")
public class Course {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private User user;

	/** Upper case, unique per user (uk_courses_user_code). */
	@Column(nullable = false, length = 20)
	private String code;

	@Column(nullable = false, length = 100)
	private String name;

	@Column(nullable = false, length = 100)
	private String instructor = "";

	@Column(nullable = false)
	private Integer credits;

	/** Highest grade first: A, B+, B, C+, C, D+, D, F (F = 0). */
	@ElementCollection(fetch = FetchType.EAGER)
	@CollectionTable(name = "course_grade_scale", joinColumns = @JoinColumn(name = "course_id"))
	@OrderBy("minPercent DESC")
	private List<GradeScaleEntry> gradeScale = new ArrayList<>();

	public Long getId() { return id; }

	public User getUser() { return user; }
	public void setUser(User user) { this.user = user; }

	public String getCode() { return code; }
	public void setCode(String code) { this.code = code; }

	public String getName() { return name; }
	public void setName(String name) { this.name = name; }

	public String getInstructor() { return instructor; }
	public void setInstructor(String instructor) { this.instructor = instructor; }

	public Integer getCredits() { return credits; }
	public void setCredits(Integer credits) { this.credits = credits; }

	public List<GradeScaleEntry> getGradeScale() { return gradeScale; }

	/** Replaces all entries (Hibernate rewrites the course's rows in course_grade_scale). */
	public void setGradeScale(List<GradeScaleEntry> entries) {
		gradeScale.clear();
		gradeScale.addAll(entries);
	}
}
