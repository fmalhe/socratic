# AGENTS.md

Guidelines for coding agents working on **Socratic** (Cloudflare Workers + D1 + TypeScript).

## Stack
- **Runtime:** Cloudflare Workers Free Tier (`wrangler`, Hono, Zod, TypeScript strict mode)
- **Database:** Cloudflare D1 (SQLite) with SQL migrations in `migrations/`
- **AI:** Google Gemini REST API (`src/lib/gemini.ts`) with structured JSON `responseSchema`
- **Frontend:** Vanilla HTML/CSS/ES Modules in `public/` (Apple + Linear minimal iPad Safari PWA)
- **MCP:** Streamable HTTP JSON-RPC 2.0 endpoint at `POST /mcp` (`src/modules/mcp.ts`)

## Verification Commands
```bash
npm run typecheck
npm test
```

## Conventions
- Keep vertical feature modules cleanly separated in `src/modules/` (`profile`, `reading`, `homework`, `audio`, `progress`, `mcp`).
- Never hardcode languages or dialect rules; always load the active profile from D1 (`getActiveProfile`) and inject dynamically into prompts.
- Validate all incoming JSON bodies with `zod`; use `resolveProfileId` for `X-Profile-Id` (defaulting to `1`).
- Keep `ALLOWED_IPS` middleware in `src/index.ts` intact so home-network-only enforcement works even on free `*.workers.dev`.
