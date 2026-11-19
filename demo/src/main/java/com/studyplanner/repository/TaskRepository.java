package com.studyplanner.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.studyplanner.entity.Task;

/** Tasks belong to a user through their course (task.course.user). */
public interface TaskRepository extends JpaRepository<Task, Long> {

	List<Task> findByCourseUserIdOrderByDueDateAscIdAsc(Long userId);

	Optional<Task> findByIdAndCourseUserId(Long id, Long userId);
}
