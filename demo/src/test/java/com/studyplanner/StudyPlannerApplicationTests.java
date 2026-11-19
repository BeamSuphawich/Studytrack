package com.studyplanner;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Starts the whole app on H2 and checks that schema.sql matches the JPA entities (ddl-auto=validate). */
@SpringBootTest
@ActiveProfiles("test")
class StudyPlannerApplicationTests {

	@Test
	void contextLoads() {
	}

}
