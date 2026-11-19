package com.studyplanner.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.studyplanner.entity.GradeItem;

/** Grade items belong to a user through their course (gradeItem.course.user). */
public interface GradeItemRepository extends JpaRepository<GradeItem, Long> {

	List<GradeItem> findByCourseIdOrderByIdAsc(Long courseId);

	Optional<GradeItem> findByIdAndCourseUserId(Long id, Long userId);
}
