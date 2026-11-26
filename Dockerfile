# syntax=docker/dockerfile:1

FROM eclipse-temurin:25-jdk AS builder
WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml lombok.config checkstyle.xml rewrite.yml ./
RUN ./mvnw dependency:go-offline -B

COPY src/ src/
RUN ./mvnw package -DskipTests -B

FROM litestream/litestream:0.5 AS litestream

FROM eclipse-temurin:25-jre
WORKDIR /app

COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream

RUN groupadd --system app \
    && useradd --system --gid app app \
    && mkdir -p /app/data \
    && chown -R app:app /app

COPY --from=builder --chown=app:app /workspace/target/*.jar /app/app.jar
COPY --chown=app:app docker/litestream.yml /app/litestream.yml
COPY --chown=app:app --chmod=755 docker/entrypoint.sh /app/entrypoint.sh

USER app:app

ENV SPRING_DATASOURCE_URL=jdbc:sqlite:/app/data/tutor.db
EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
