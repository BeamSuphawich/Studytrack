package com.studyplanner.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.studyplanner.entity.Course;
import com.studyplanner.entity.GradeItem;
import com.studyplanner.entity.GradeItemType;
import com.studyplanner.entity.GradeScaleEntry;
import com.studyplanner.entity.Task;
import com.studyplanner.entity.TaskStatus;
import com.studyplanner.entity.User;
import com.studyplanner.repository.CourseRepository;
import com.studyplanner.repository.GradeItemRepository;
import com.studyplanner.repository.TaskRepository;

/**
 * Sample courses, tasks and grades for a new account (same data as the phase-1 js/api.js).
 * Due dates are relative to the real current date. Turned off with APP_SAMPLE_DATA=false.
 */
@Service
public class SampleDataService {

	private final CourseRepository courses;
	private final TaskRepository tasks;
	private final GradeItemRepository gradeItems;
	private final boolean enabled;

	public SampleDataService(CourseRepository courses, TaskRepository tasks, GradeItemRepository gradeItems,
			@Value("${app.sample-data:true}") boolean enabled) {
		this.courses = courses;
		this.tasks = tasks;
		this.gradeItems = gradeItems;
		this.enabled = enabled;
	}

	@Transactional
	public void createFor(User user) {
		if (!enabled) {
			return;
		}
		Course cs = course(user, "CS201", "Data Structures & Algorithms", "Dr. Sarah Chen", 3);
		Course math = course(user, "MATH215", "Linear Algebra", "Prof. David Kim", 3);
		Course phy = course(user, "PHY101", "General Physics I", "Dr. Marcus Reyes", 4);
		Course eng = course(user, "ENG110", "Academic Writing", "Ms. Laura Bennett", 2);
		Course bus = course(user, "BUS120", "Principles of Marketing", "Dr. Aisha Patel", 3);

		// A stricter A in CS201 (85 instead of 80) shows that each course has its own scale.
		List<GradeScaleEntry> csScale = GradeScales.defaultEntries();
		csScale.set(0, new GradeScaleEntry("A", BigDecimal.valueOf(85)));
		cs.setGradeScale(csScale);
		courses.save(cs);

		LocalDate today = LocalDate.now();
		task(cs, "Read Chapter 9: Graphs", today, TaskStatus.TODO);
		task(math, "Problem Set 7: Eigenvalues", today.plusDays(1), TaskStatus.IN_PROGRESS);
		task(phy, "Lab report: Projectile motion", today.minusDays(2), TaskStatus.TODO);
		task(cs, "Binary search tree assignment", today.plusDays(2), TaskStatus.IN_PROGRESS);
		task(eng, "Argumentative essay — first draft", today.plusDays(4), TaskStatus.IN_PROGRESS);
		task(bus, "Case study: product launch analysis", today.plusDays(8), TaskStatus.TODO);
		task(math, "Problem Set 8", today.plusDays(9), TaskStatus.TODO);
		task(phy, "Final exam study guide", today.plusDays(11), TaskStatus.TODO);
		task(bus, "Group presentation slides", today.plusDays(16), TaskStatus.TODO);
		task(math, "Quiz 4 review", today.minusDays(4), TaskStatus.DONE);
		task(eng, "Peer review: classmate outlines", today.minusDays(6), TaskStatus.DONE);
		task(cs, "Hash table implementation", today.minusDays(10), TaskStatus.DONE);
		task(phy, "Lab report: Free fall", today.minusDays(12), TaskStatus.DONE);

		// score null = not graded yet
		item(cs, "Quiz 1", GradeItemType.COURSEWORK, 18, 20, 5);
		item(cs, "Quiz 2", GradeItemType.COURSEWORK, 15, 20, 5);
		item(cs, "Programming Assignment 1", GradeItemType.COURSEWORK, 46, 50, 10);
		item(cs, "Programming Assignment 2", GradeItemType.COURSEWORK, null, 50, 10);
		item(cs, "Midterm Exam", GradeItemType.MIDTERM, 68, 100, 30);
		item(cs, "Final Exam", GradeItemType.FINAL, null, 100, 40);

		item(math, "Homework", GradeItemType.COURSEWORK, 92, 100, 15);
		item(math, "Quiz 1", GradeItemType.COURSEWORK, 8, 10, 5);
		item(math, "Quiz 2", GradeItemType.COURSEWORK, 7, 10, 5);
		item(math, "Midterm Exam", GradeItemType.MIDTERM, 74, 100, 35);
		item(math, "Final Exam", GradeItemType.FINAL, null, 100, 40);

		item(phy, "Lab reports", GradeItemType.COURSEWORK, 42, 50, 15);
		item(phy, "Problem sets", GradeItemType.COURSEWORK, 80, 100, 15);
		item(phy, "Midterm Exam", GradeItemType.MIDTERM, 61, 100, 30);
		item(phy, "Final Exam", GradeItemType.FINAL, null, 100, 40);

		item(eng, "Essay 1", GradeItemType.COURSEWORK, 85, 100, 20);
		item(eng, "Participation", GradeItemType.COURSEWORK, 18, 20, 10);
		item(eng, "Presentation", GradeItemType.COURSEWORK, 40, 50, 20);
		item(eng, "In-class essay", GradeItemType.MIDTERM, 78, 100, 20);
		item(eng, "Final portfolio", GradeItemType.FINAL, null, 100, 30);
		// BUS120 has no assessments yet (shows the empty state).
	}

	private Course course(User user, String code, String name, String instructor, int credits) {
		Course c = new Course();
		c.setUser(user);
		c.setCode(code);
		c.setName(name);
		c.setInstructor(instructor);
		c.setCredits(credits);
		c.setGradeScale(GradeScales.defaultEntries());
		return courses.save(c);
	}

	private void task(Course course, String title, LocalDate due, TaskStatus status) {
		Task t = new Task();
		t.setCourse(course);
		t.setTitle(title);
		t.setDueDate(due);
		t.setStatus(status);
		tasks.save(t);
	}

	private void item(Course course, String name, GradeItemType type, Integer score, int maxScore, int weight) {
		GradeItem g = new GradeItem();
		g.setCourse(course);
		g.setName(name);
		g.setType(type);
		g.setScore(score == null ? null : BigDecimal.valueOf(score));
		g.setMaxScore(BigDecimal.valueOf(maxScore));
		g.setWeight(BigDecimal.valueOf(weight));
		gradeItems.save(g);
	}
}
