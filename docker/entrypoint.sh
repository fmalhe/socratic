#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/data

JVM_OPTS="${JVM_OPTS:--XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom}"

if [[ -n "${LITESTREAM_R2_BUCKET:-}" ]]; then
  echo "[entrypoint] Restoring SQLite database from R2 bucket '${LITESTREAM_R2_BUCKET}' if replica exists..."
  litestream restore -if-db-not-exists -if-replica-exists -config /app/litestream.yml /app/data/tutor.db

  echo "[entrypoint] Starting Socratic with continuous Litestream R2 replication..."
  exec litestream replicate -config /app/litestream.yml -exec "java ${JVM_OPTS} -jar /app/app.jar"
else
  echo "[entrypoint] LITESTREAM_R2_BUCKET not set; starting Socratic with local SQLite only..."
  exec java ${JVM_OPTS} -jar /app/app.jar
fi
