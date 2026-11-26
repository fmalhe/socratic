# Socratic — Multilingual Reading & Homework Tutor

Runs **100% free (\$0/month)** on **Cloudflare Workers + D1 (SQLite) + Workers Static Assets**, with an Apple/Linear-inspired **iPad Safari PWA**, **Google Gemini** multimodal tutoring, and an **MCP Server** (`POST /mcp`).

## Local Development

```bash
npm install
npm run db:migrate:local
echo "GEMINI_API_KEY=your-key" > .dev.vars
npm run dev
```

Open `http://localhost:8787` in your browser.

## Tests & Verification

```bash
npm run typecheck
npm test
```

## Deploying for \$0/month

See [docs/cloudflare-deploy.md](docs/cloudflare-deploy.md) for the 5-minute Cloudflare Workers Free + D1 + GitHub Actions setup (including locking access to your home network).
