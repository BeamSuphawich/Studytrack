package com.studyplanner.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.studyplanner.entity.Course;

/** Every lookup includes the owner's user id, so a user can never reach another user's course. */
public interface CourseRepository extends JpaRepository<Course, Long> {

	List<Course> findByUserIdOrderByIdAsc(Long userId);

	Optional<Course> findByIdAndUserId(Long id, Long userId);

	boolean existsByUserIdAndCode(Long userId, String code);

	boolean existsByUserIdAndCodeAndIdNot(Long userId, String code, Long id);
}
