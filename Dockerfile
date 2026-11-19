# Study Planner backend image.
# Spring Boot serves both the REST API (/api/...) and the static frontend on port 8080,
# so there is no separate frontend container.
# Build context = project root (see .dockerignore: .env, target/, .git and design/ are never sent).
# No passwords are baked into this image: DB_PASSWORD etc. come from the environment at run time.

# ---------- Stage 1: build the WAR with the project's Maven wrapper + JDK 17 ----------
FROM eclipse-temurin:17-jdk AS build
WORKDIR /build

# Maven wrapper and pom first, so the dependency download is cached between builds.
COPY demo/mvnw demo/pom.xml ./
COPY demo/.mvn ./.mvn
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline

# Then the sources. Tests are not run here (they run with H2 via ./mvnw test).
COPY demo/src ./src
RUN ./mvnw -B -q -DskipTests package \
 && cp target/studyplanner-*.war /build/app.war

# ---------- Stage 2: run with a JRE only ----------
FROM eclipse-temurin:17-jre
WORKDIR /app

# Run as an unprivileged user, not root.
RUN groupadd --system app && useradd --system --gid app --no-create-home app
COPY --from=build /build/app.war /app/app.war
USER app

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.war"]
