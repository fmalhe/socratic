# Socratic — Multilingual Reading & Homework Tutor Backend

Spring Boot 4.2.0, Java 25, Spring AI (Google Gemini), jOOQ + SQLite + Flyway, and Spring Modulith backend.

## Configuration

Set the required environment variables before starting the application:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
# Optional: override Gemini model (default: gemini-2.5-flash)
export GEMINI_MODEL="gemini-2.5-flash"
# Optional: enable Google Cloud TTS (if unset, POST /api/audio/speak returns 501 so frontend falls back to speechSynthesis)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/gcp-credentials.json"
```

Key `application.yaml` properties:
- `spring.datasource.url`: `jdbc:sqlite:./data/tutor.db` (single-writer Hikari pool with `PRAGMA foreign_keys = ON;`)
- `spring.jooq.sql-dialect`: `SQLITE`
- `spring.modulith.events.jdbc.schema-initialization.enabled`: `false` (managed via Flyway `V1__init_schema.sql`)
- `app.cors.allowed-origins`: `http://localhost:3000,http://localhost:5173,http://localhost:4200`

## Running & Verifying

```bash
./mvnw spring-boot:run
./mvnw verify
```

## Example `curl` Requests

### 1. Get & Update Active Learner Profile
```bash
curl -s http://localhost:8080/api/profile | jq

curl -s -X PUT http://localhost:8080/api/profile \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sofia",
    "age": 8,
    "targetLanguageCode": "pt-PT",
    "targetLanguageName": "European Portuguese",
    "nativeLanguageCode": "nb-NO",
    "nativeLanguageName": "Norwegian",
    "dialectRules": "ALWAYS use European Portuguese (PT-PT)—never Brazilian Portuguese. Use tu forms, estar a + infinitivo, and PT-PT vocabulary like autocarro, pequeno-almoço, telemóvel, and ecrã.",
    "ttsVoiceName": "pt-PT-Wavenet-A"
  }' | jq
```

### 2. Scan a Book Page (`reading`)
```bash
curl -s -X POST http://localhost:8080/api/reading/scan \
  -F "image=@/path/to/book-page.jpg" | jq
```

### 3. Homework Helper (`homework`)

Scan a full homework page into persisted exercises and tackle them one by one:
```bash
# Scan homework page -> returns sessionId + ordered exercises with explanations, tricky words, and opening question
curl -s -X POST http://localhost:8080/api/homework/sessions/scan \
  -F "image=@/path/to/homework-page.jpg" | jq

# List or resume a homework session
curl -s http://localhost:8080/api/homework/sessions/1 | jq

# Ping-pong on a single exercise (reading together & explaining without giving away the answer)
curl -s -X POST http://localhost:8080/api/homework/sessions/1/exercises/1/reply \
  -H "Content-Type: application/json" \
  -d '{"message": "Hva betyr ordet pequeno-almoço?"}' | jq

# Mark exercise done and move to the next one
curl -s -X POST http://localhost:8080/api/homework/sessions/1/exercises/1/complete | jq

# Quick one-off question or single-exercise photo
curl -s -X POST http://localhost:8080/api/homework/help \
  -F "question=O que significa pequeno-almoço?" \
  -F "image=@/path/to/homework.jpg" | jq
```

### 4. Text-to-Speech (`audio`)
```bash
curl -i -X POST http://localhost:8080/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Bom dia! Como estás?", "languageCode": "pt-PT", "slow": true}' \
  --output speech.mp3
```

### 5. Progress & Streaks (`progress`)
```bash
curl -s http://localhost:8080/api/progress | jq

curl -s -X POST http://localhost:8080/api/progress/complete \
  -H "Content-Type: application/json" \
  -d '{"activityType": "READING", "starsEarned": 10, "trickyWords": ["borboleta", "autocarro"]}' | jq
```

## iPad Safari Web App (PWA)

The kid-friendly web app is served directly at `/` when the Spring Boot server runs (`./mvnw spring-boot:run`):
- Open `http://<your-machine-lan-ip>:8080` in **Safari on iPad** (or tap **Share → Add to Home Screen** for full-screen PWA mode).
- Supports iPad camera capture (`capture="environment"`), tap-to-hear syllables, slow `0.75x` TTS with automatic Safari `speechSynthesis` fallback when GCP TTS is not configured, and exercise-by-exercise homework ping-pong.

## MCP Server (for Gemini / AI Agents)

Socratic also runs a Spring AI WebMVC MCP Server (`spring-ai-starter-mcp-server-webmvc`) on the same port, exposing parent/agent tools:
- `getLearnerProfile`
- `getProgressAndTrickyWords`
- `listHomeworkSessions`
- `getHomeworkSession`
