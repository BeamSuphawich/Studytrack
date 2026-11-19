package com.studyplanner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

/** Courses, grade scale, tasks and grade items: CRUD, validation, data isolation between users, cascade delete (H2). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DataApiTests {

	private static final String DEFAULT_SCALE_WITH_A_85 = """
			[{"letter":"A","minPercent":85},{"letter":"B+","minPercent":75},{"letter":"B","minPercent":70},
			 {"letter":"C+","minPercent":65},{"letter":"C","minPercent":60},{"letter":"D+","minPercent":55},
			 {"letter":"D","minPercent":50},{"letter":"F","minPercent":0}]""";

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	// ---------- helpers ----------

	private MockHttpSession newUser() throws Exception {
		String email = "u-" + UUID.randomUUID() + "@uni.edu";
		return (MockHttpSession) mvc.perform(post("/api/auth/register").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"Test\",\"email\":\"" + email + "\",\"password\":\"password1\"}"))
			.andExpect(status().isCreated())
			.andReturn().getRequest().getSession(false);
	}

	private ResultActions send(MockHttpServletRequestBuilder req, MockHttpSession s, String json) throws Exception {
		req.session(s).with(csrf());
		if (json != null) {
			req.contentType(MediaType.APPLICATION_JSON).content(json);
		}
		return mvc.perform(req);
	}

	private static long id(ResultActions r) throws Exception {
		return ((Number) JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
	}

	private long createCourse(MockHttpSession s, String code) throws Exception {
		return id(send(post("/api/courses"), s, "{\"code\":\"" + code + "\",\"name\":\"Course " + code + "\",\"credits\":3}")
				.andExpect(status().isCreated()));
	}

	private long createTask(MockHttpSession s, long courseId) throws Exception {
		return id(send(post("/api/tasks"), s, "{\"title\":\"Homework\",\"courseId\":" + courseId + ",\"dueDate\":\"2026-12-01\"}")
				.andExpect(status().isCreated()));
	}

	private long createItem(MockHttpSession s, long courseId) throws Exception {
		return id(send(post("/api/courses/" + courseId + "/grade-items"), s,
				"{\"name\":\"Quiz\",\"type\":\"COURSEWORK\",\"score\":18,\"maxScore\":20,\"weight\":10}")
				.andExpect(status().isCreated()));
	}

	// ---------- courses + grade scale ----------

	@Test
	void courseCrudWithDefaultScaleAndValidation() throws Exception {
		MockHttpSession s = newUser();
		long id = id(send(post("/api/courses"), s, "{\"code\":\" cs999 \",\"name\":\"Algorithms\",\"instructor\":\"Dr. X\",\"credits\":3}")
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.code").value("CS999"))
			.andExpect(jsonPath("$.gradeScale.length()").value(8))
			.andExpect(jsonPath("$.gradeScale[0].letter").value("A"))
			.andExpect(jsonPath("$.gradeScale[0].minPercent").value(80.0))
			.andExpect(jsonPath("$.gradeScale[7].minPercent").value(0.0)));

		send(post("/api/courses"), s, "{\"code\":\"cs999\",\"name\":\"Dup\",\"credits\":3}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.code").value("You already have a course with this code."));
		send(post("/api/courses"), s, "{\"code\":\"\",\"name\":\"\",\"credits\":9}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.code").value("Enter a course code."))
			.andExpect(jsonPath("$.fieldErrors.name").value("Enter a course name."))
			.andExpect(jsonPath("$.fieldErrors.credits").value("Credits must be 1–6."));

		send(put("/api/courses/" + id + "/grade-scale"), s, DEFAULT_SCALE_WITH_A_85).andExpect(status().isOk());
		// PUT course keeps the scale
		send(put("/api/courses/" + id), s, "{\"code\":\"CS999\",\"name\":\"Algorithms II\",\"instructor\":\"\",\"credits\":4}")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Algorithms II"))
			.andExpect(jsonPath("$.gradeScale[0].minPercent").value(85.0));

		send(delete("/api/courses/" + id), s, null).andExpect(status().isNoContent());
		send(get("/api/courses/" + id + "/grade-items"), s, null).andExpect(status().isNotFound());
	}

	@Test
	void gradeScaleValidation() throws Exception {
		MockHttpSession s = newUser();
		long id = createCourse(s, "GS1");
		String url = "/api/courses/" + id + "/grade-scale";

		send(put(url), s, DEFAULT_SCALE_WITH_A_85.replace("\"B+\",\"minPercent\":75", "\"B+\",\"minPercent\":90"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors['B+']").value("Must be lower than A."));
		send(put(url), s, DEFAULT_SCALE_WITH_A_85.replace("\"B\",\"minPercent\":70", "\"B\",\"minPercent\":75"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.B").value("Must be lower than B+."));
		send(put(url), s, DEFAULT_SCALE_WITH_A_85.replace("\"A\",\"minPercent\":85", "\"A\",\"minPercent\":101"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.A").value("Must be between 0 and 100."));
		send(put(url), s, DEFAULT_SCALE_WITH_A_85.replace("\"D\",\"minPercent\":50", "\"D\",\"minPercent\":0"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.D").value("Must be above 0."));
		send(put(url), s, "[{\"letter\":\"A\",\"minPercent\":80}]")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.gradeScale").exists());

		send(put(url), s, DEFAULT_SCALE_WITH_A_85)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.gradeScale[0].minPercent").value(85.0));
		assertThat(jdbc.queryForObject("SELECT min_percent FROM course_grade_scale WHERE course_id=? AND letter='A'",
				Double.class, id)).isEqualTo(85.0);
	}

	// ---------- tasks ----------

	@Test
	void taskCrudAndValidation() throws Exception {
		MockHttpSession s = newUser();
		long course = createCourse(s, "T1");
		long task = id(send(post("/api/tasks"), s, "{\"title\":\" Essay \",\"courseId\":" + course + ",\"dueDate\":\"2026-11-20\"}")
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.title").value("Essay"))
			.andExpect(jsonPath("$.dueDate").value("2026-11-20"))
			.andExpect(jsonPath("$.status").value("TODO")));

		send(post("/api/tasks"), s, "{\"title\":\"\",\"courseId\":999999,\"dueDate\":\"2026-02-30\",\"status\":\"LATE\"}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.title").value("Enter a task title."))
			.andExpect(jsonPath("$.fieldErrors.courseId").value("Choose a course."))
			.andExpect(jsonPath("$.fieldErrors.dueDate").value("Pick a due date."))
			.andExpect(jsonPath("$.fieldErrors.status").value("Choose a valid status."));

		send(put("/api/tasks/" + task), s, "{\"title\":\"Essay v2\",\"courseId\":" + course + ",\"dueDate\":\"2026-11-25\",\"status\":\"IN_PROGRESS\"}")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("IN_PROGRESS"));
		send(patch("/api/tasks/" + task), s, "{\"status\":\"DONE\"}")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("DONE"));
		send(patch("/api/tasks/" + task), s, "{\"status\":\"OVERDUE\"}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.status").value("Choose a valid status."));
		send(delete("/api/tasks/" + task), s, null).andExpect(status().isNoContent());
		send(delete("/api/tasks/" + task), s, null).andExpect(status().isNotFound());
	}

	// ---------- grade items ----------

	@Test
	void gradeItemCrudPatchAndValidation() throws Exception {
		MockHttpSession s = newUser();
		long course = createCourse(s, "G1");
		String list = "/api/courses/" + course + "/grade-items";

		send(post(list), s, "{\"name\":\"Quiz\",\"type\":\"COURSEWORK\",\"score\":25,\"maxScore\":20,\"weight\":10}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.score").value("Score can’t be higher than the max score."));
		send(post(list), s, "{\"name\":\"\",\"type\":\"EXAM\",\"score\":-1,\"maxScore\":0,\"weight\":101}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.name").value("Enter a name."))
			.andExpect(jsonPath("$.fieldErrors.type").value("Choose a type."))
			.andExpect(jsonPath("$.fieldErrors.score").value("Score can’t be negative."))
			.andExpect(jsonPath("$.fieldErrors.maxScore").value("Max score must be greater than 0."))
			.andExpect(jsonPath("$.fieldErrors.weight").value("Weight must be more than 0 and at most 100%."));
		send(post(list), s, "{\"name\":\"Quiz\",\"type\":\"COURSEWORK\",\"maxScore\":20,\"weight\":0}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.weight").exists());

		long item = createItem(s, course);
		String one = "/api/grade-items/" + item;
		send(patch(one), s, "{\"score\":19.5}").andExpect(status().isOk()).andExpect(jsonPath("$.score").value(19.5))
			.andExpect(jsonPath("$.name").value("Quiz"));
		send(patch(one), s, "{\"maxScore\":10}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.score").value("Score can’t be higher than the max score."));
		send(patch(one), s, "{\"score\":null}").andExpect(status().isOk()).andExpect(jsonPath("$.score").doesNotExist());
		send(get(list), s, null).andExpect(status().isOk())
			.andExpect(jsonPath("$[0].score").isEmpty())
			.andExpect(jsonPath("$[0].maxScore").value(20.0));
		send(delete(one), s, null).andExpect(status().isNoContent());
		send(get(list), s, null).andExpect(jsonPath("$.length()").value(0));
	}

	// ---------- isolation between users ----------

	@Test
	void userCannotSeeOrChangeAnotherUsersData() throws Exception {
		MockHttpSession a = newUser();
		MockHttpSession b = newUser();
		long bCourse = createCourse(b, "BONLY");
		long bTask = createTask(b, bCourse);
		long bItem = createItem(b, bCourse);

		send(get("/api/courses/" + bCourse + "/grade-items"), a, null).andExpect(status().isNotFound());
		send(post("/api/courses/" + bCourse + "/grade-items"), a,
				"{\"name\":\"X\",\"type\":\"FINAL\",\"maxScore\":100,\"weight\":10}").andExpect(status().isNotFound());
		send(put("/api/courses/" + bCourse), a, "{\"code\":\"HACK\",\"name\":\"Hack\",\"credits\":3}").andExpect(status().isNotFound());
		send(put("/api/courses/" + bCourse + "/grade-scale"), a, DEFAULT_SCALE_WITH_A_85).andExpect(status().isNotFound());
		send(delete("/api/courses/" + bCourse), a, null).andExpect(status().isNotFound());
		send(put("/api/tasks/" + bTask), a, "{\"title\":\"X\",\"courseId\":" + bCourse + ",\"dueDate\":\"2026-12-01\"}")
			.andExpect(status().isNotFound());
		send(patch("/api/tasks/" + bTask), a, "{\"status\":\"DONE\"}").andExpect(status().isNotFound());
		send(delete("/api/tasks/" + bTask), a, null).andExpect(status().isNotFound());
		send(patch("/api/grade-items/" + bItem), a, "{\"score\":1}").andExpect(status().isNotFound());
		send(delete("/api/grade-items/" + bItem), a, null).andExpect(status().isNotFound());
		// A cannot put a task into B's course
		send(post("/api/tasks"), a, "{\"title\":\"X\",\"courseId\":" + bCourse + ",\"dueDate\":\"2026-12-01\"}")
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.courseId").value("Choose a course."));

		// A's lists never contain B's rows; B's data is unchanged
		String aCourses = send(get("/api/courses"), a, null).andReturn().getResponse().getContentAsString();
		String aTasks = send(get("/api/tasks"), a, null).andReturn().getResponse().getContentAsString();
		assertThat(aCourses).doesNotContain("BONLY");
		assertThat(JsonPath.<java.util.List<Integer>>read(aTasks, "$[*].id")).doesNotContain((int) bTask);
		send(get("/api/courses/" + bCourse + "/grade-items"), b, null).andExpect(jsonPath("$[0].score").value(18.0));
	}

	// ---------- cascade delete ----------

	@Test
	void deletingACourseRemovesItsTasksGradeItemsAndScale() throws Exception {
		MockHttpSession s = newUser();
		long course = createCourse(s, "DEL1");
		long keep = createCourse(s, "KEEP1");
		createTask(s, course);
		createTask(s, course);
		createItem(s, course);
		createTask(s, keep);

		assertThat(count("tasks", course)).isEqualTo(2);
		assertThat(count("grade_items", course)).isEqualTo(1);
		assertThat(count("course_grade_scale", course)).isEqualTo(8);

		send(delete("/api/courses/" + course), s, null).andExpect(status().isNoContent());

		assertThat(count("tasks", course)).isZero();
		assertThat(count("grade_items", course)).isZero();
		assertThat(count("course_grade_scale", course)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM courses WHERE id=?", Integer.class, course)).isZero();
		assertThat(count("tasks", keep)).isEqualTo(1);
		assertThat(count("course_grade_scale", keep)).isEqualTo(8);
	}

	private int count(String table, long courseId) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE course_id=?", Integer.class, courseId);
	}
}
