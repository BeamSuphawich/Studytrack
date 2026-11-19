package com.studyplanner;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/**
 * Cookie behaviour checked over real HTTP (embedded server on a random port), like a browser or curl would see it:
 * the CSRF cookie, the session cookie flags, and the full CSRF round trip.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class CookieHttpTests {

	@LocalServerPort
	int port;

	private final HttpClient http = HttpClient.newHttpClient();

	private HttpResponse<String> send(HttpRequest.Builder builder) throws Exception {
		return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
	}

	private URI uri(String path) {
		return URI.create("http://localhost:" + port + path);
	}

	private static String cookieValue(List<String> setCookies, String name) {
		return setCookies.stream()
				.filter(h -> h.startsWith(name + "="))
				.map(h -> h.substring(name.length() + 1, h.indexOf(';')))
				.findFirst().orElse(null);
	}

	@Test
	void firstPageLoadSetsReadableCsrfCookie() throws Exception {
		HttpResponse<String> res = send(HttpRequest.newBuilder(uri("/login.html")).GET());
		assertThat(res.statusCode()).isEqualTo(200);
		assertThat(res.headers().allValues("Set-Cookie"))
			.anySatisfy(h -> assertThat(h).startsWith("XSRF-TOKEN=").contains("SameSite=Lax").doesNotContain("HttpOnly"));
	}

	@Test
	void unauthorizedApiCallDoesNotCreateASession() throws Exception {
		HttpResponse<String> res = send(HttpRequest.newBuilder(uri("/api/auth/me")).GET());
		assertThat(res.statusCode()).isEqualTo(401);
		assertThat(res.headers().allValues("Set-Cookie")).noneMatch(h -> h.startsWith("JSESSIONID="));
	}

	@Test
	void csrfRoundTripAndHttpOnlySessionCookie() throws Exception {
		String xsrf = cookieValue(send(HttpRequest.newBuilder(uri("/login.html")).GET()).headers().allValues("Set-Cookie"), "XSRF-TOKEN");
		assertThat(xsrf).isNotBlank();
		String body = "{\"name\":\"Cookie Test\",\"email\":\"c-" + UUID.randomUUID() + "@uni.edu\",\"password\":\"password1\"}";

		// Without the header: 403
		HttpResponse<String> noHeader = send(HttpRequest.newBuilder(uri("/api/auth/register"))
				.header("Content-Type", "application/json")
				.header("Cookie", "XSRF-TOKEN=" + xsrf)
				.POST(HttpRequest.BodyPublishers.ofString(body)));
		assertThat(noHeader.statusCode()).isEqualTo(403);

		// With cookie + matching X-XSRF-TOKEN header: 201 and an HttpOnly, SameSite=Lax session cookie
		HttpResponse<String> ok = send(HttpRequest.newBuilder(uri("/api/auth/register"))
				.header("Content-Type", "application/json")
				.header("Cookie", "XSRF-TOKEN=" + xsrf)
				.header("X-XSRF-TOKEN", xsrf)
				.POST(HttpRequest.BodyPublishers.ofString(body)));
		assertThat(ok.statusCode()).isEqualTo(201);
		assertThat(ok.headers().allValues("Set-Cookie"))
			.anySatisfy(h -> assertThat(h).startsWith("JSESSIONID=").contains("HttpOnly").contains("SameSite=Lax"));
	}
}
