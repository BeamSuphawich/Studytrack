-- Study Planner database schema (MySQL 8).
-- Runs on every start; IF NOT EXISTS keeps existing data. Hibernate validates the entities against it.
-- Deleting a user removes their courses; deleting a course removes its grade scale, tasks and grade items.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uk_users_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS courses (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  user_id    BIGINT       NOT NULL,
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(100) NOT NULL,
  instructor VARCHAR(100) NOT NULL DEFAULT '',
  credits    INT          NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_courses_user_code UNIQUE (user_id, code),
  CONSTRAINT fk_courses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ck_courses_credits CHECK (credits BETWEEN 1 AND 6)
);

-- One row per letter grade of a course (A, B+, B, C+, C, D+, D, F). F is always 0.
CREATE TABLE IF NOT EXISTS course_grade_scale (
  course_id   BIGINT       NOT NULL,
  letter      VARCHAR(2)   NOT NULL,
  min_percent DECIMAL(5,2) NOT NULL,
  PRIMARY KEY (course_id, letter),
  CONSTRAINT fk_scale_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT ck_scale_range CHECK (min_percent BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS tasks (
  id        BIGINT       NOT NULL AUTO_INCREMENT,
  course_id BIGINT       NOT NULL,
  title     VARCHAR(200) NOT NULL,
  due_date  DATE         NOT NULL,
  status    VARCHAR(20)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_tasks_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT ck_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE'))
);

-- score NULL = not graded yet (never treated as 0).
CREATE TABLE IF NOT EXISTS grade_items (
  id        BIGINT        NOT NULL AUTO_INCREMENT,
  course_id BIGINT        NOT NULL,
  name      VARCHAR(100)  NOT NULL,
  type      VARCHAR(20)   NOT NULL,
  score     DECIMAL(10,2) NULL,
  max_score DECIMAL(10,2) NOT NULL,
  weight    DECIMAL(5,2)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_grade_items_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT ck_grade_items_type CHECK (type IN ('COURSEWORK', 'MIDTERM', 'FINAL')),
  CONSTRAINT ck_grade_items_values CHECK (max_score > 0 AND weight > 0 AND weight <= 100
                                          AND (score IS NULL OR (score >= 0 AND score <= max_score)))
);
