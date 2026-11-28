# AGENTS.md

Guidelines for coding agents working on **Socratic** (Cloudflare Workers + D1 + R2 + TypeScript).

## Stack
- **Runtime:** Cloudflare Workers Free Tier (`wrangler`, Hono, Zod, TypeScript strict mode)
- **Database:** Cloudflare D1 (SQLite) with SQL migrations in `migrations/` (`0001`–`0006`)
- **Object Storage:** Cloudflare R2 (`UPLOADS` bucket) for scanned page photos and provider-isolated TTS audio caching (`src/modules/uploads.ts`, `src/modules/audio.ts`)
- **AI:** Google Gemini REST API (`src/lib/gemini.ts`) with structured JSON `responseSchema`
- **Frontend:** Vanilla HTML/CSS/ES Modules in `public/` (no-build static PWA)
- **MCP:** Streamable HTTP JSON-RPC 2.0 endpoint at `POST /mcp` (`src/modules/mcp.ts`)

## Verification Commands
```bash
npm run typecheck
npm test
```

## Conventions
- Keep vertical feature modules cleanly separated in `src/modules/` (`profile`, `reading`, `homework`, `audio`, `progress`, `uploads`, `mcp`).
- Never hardcode languages or dialect rules; always load the active profile from D1 (`getActiveProfile`) and inject dynamically into prompts and TTS `speechMetadata`.
- Validate all incoming JSON bodies and MCP JSON-RPC payloads with `zod`, validate image uploads with `validateImageUpload` (MIME allowlist + magic bytes), use `resolveProfileId` for `X-Profile-Id` (defaulting to `1`), and return `400` on malformed JSON/FormData/non-integer params and `404` on missing profiles.
- Keep `ALLOWED_IPS` middleware in `src/index.ts` intact so home-network-only enforcement works even on free `*.workers.dev`, and keep `D1_DATABASE_ID` = `"REPLACE_WITH_YOUR_D1_DATABASE_ID"` in `wrangler.jsonc`.
