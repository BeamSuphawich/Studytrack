package com.studyplanner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.studyplanner.repository.CourseRepository;
import com.studyplanner.repository.UserRepository;

/** Register / login / me / logout, CSRF and error shapes (H2). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthApiTests {

	@Autowired MockMvc mvc;
	@Autowired UserRepository users;
	@Autowired CourseRepository courses;

	private static String uniqueEmail() {
		return "student-" + UUID.randomUUID() + "@uni.edu";
	}

	private static String registerJson(String name, String email, String password) {
		return "{\"name\":\"" + name + "\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
	}

	private MvcResult register(String email) throws Exception {
		return mvc.perform(post("/api/auth/register").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(registerJson("Test Student", email, "password1")))
			.andExpect(status().isCreated())
			.andReturn();
	}

	@Test
	void registerWithoutCsrfTokenIs403() throws Exception {
		mvc.perform(post("/api/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content(registerJson("A", uniqueEmail(), "password1")))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.status").value(403))
			.andExpect(jsonPath("$.message").value("Missing or invalid CSRF token. Reload the page and try again."));
	}

	@Test
	void registerStoresBcryptHashCreatesSampleDataAndLogsIn() throws Exception {
		String email = uniqueEmail();
		MvcResult result = mvc.perform(post("/api/auth/register").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(registerJson("  Mia Johnson ", email.toUpperCase(), "password1")))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.name").value("Mia Johnson"))
			.andExpect(jsonPath("$.email").value(email))
			.andExpect(jsonPath("$.password").doesNotExist())
			.andReturn();

		var user = users.findByEmail(email).orElseThrow();
		assertThat(user.getPasswordHash()).startsWith("$2a$").hasSize(60).doesNotContain("password1");
		assertThat(courses.findByUserIdOrderByIdAsc(user.getId())).hasSize(5);

		MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
		mvc.perform(get("/api/auth/me").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value(email));
	}

	@Test
	void duplicateEmailIs409WithFieldError() throws Exception {
		String email = uniqueEmail();
		register(email);
		mvc.perform(post("/api/auth/register").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(registerJson("Other", email, "password2")))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.fieldErrors.email").value("An account with this email already exists."));
	}

	@Test
	void invalidRegisterIs400WithFieldErrors() throws Exception {
		mvc.perform(post("/api/auth/register").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content(registerJson(" ", "not-an-email", "short")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.status").value(400))
			.andExpect(jsonPath("$.fieldErrors.name").value("Enter your full name."))
			.andExpect(jsonPath("$.fieldErrors.email").value("Enter a valid email address."))
			.andExpect(jsonPath("$.fieldErrors.password").value("Password must be at least 8 characters."));
	}

	@Test
	void wrongPasswordIs401AndUnknownEmailLooksTheSame() throws Exception {
		String email = uniqueEmail();
		register(email);
		for (String body : new String[] {
				"{\"email\":\"" + email + "\",\"password\":\"wrong-pass\"}",
				"{\"email\":\"nobody@uni.edu\",\"password\":\"password1\"}" }) {
			mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.fieldErrors.password").value("Incorrect email or password."));
		}
	}

	@Test
	void loginMeLogoutFlow() throws Exception {
		String email = uniqueEmail();
		register(email);

		MvcResult login = mvc.perform(post("/api/auth/login").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"password\":\"password1\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value(email))
			.andReturn();
		MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);

		mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
		mvc.perform(post("/api/auth/logout").with(csrf()).session(session))
			.andExpect(status().isNoContent())
			.andExpect(cookie().maxAge("JSESSIONID", 0));
		assertThat(session.isInvalid()).isTrue();
	}

	@Test
	void meWithoutSessionIs401Json() throws Exception {
		mvc.perform(get("/api/auth/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.status").value(401))
			.andExpect(jsonPath("$.message").value("Your session has ended. Please log in again."));
	}

	// Cookie headers (XSRF-TOKEN, JSESSIONID) are checked against a real server in CookieHttpTests,
	// because MockMvc with spring-security-test changes CSRF and session handling.
}
