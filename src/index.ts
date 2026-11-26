import { Hono } from "hono";
import { cors } from "hono/cors";
import { audioRoutes } from "./modules/audio";
import { homeworkRoutes } from "./modules/homework";
import { mcpRoutes } from "./modules/mcp";
import { profileRoutes } from "./modules/profile";
import { progressRoutes } from "./modules/progress";
import { readingRoutes } from "./modules/reading";
import { uploadRoutes } from "./modules/uploads";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Optional Home-IP allowlist guard (works even on free *.workers.dev without a custom domain)
app.use("*", async (c, next) => {
  const allowed = c.env.ALLOWED_IPS?.split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (allowed && allowed.length > 0) {
    const clientIp = c.req.header("CF-Connecting-IP") ?? "";
    if (!allowed.includes(clientIp)) {
      return c.text("Forbidden — home network only", 403);
    }
  }
  await next();
});

const apiCors = cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "QUERY", "OPTIONS", "HEAD"],
  allowHeaders: ["Content-Type", "X-Profile-Id"],
  exposeHeaders: ["Accept-Query", "Content-Location", "X-Audio-Provider", "X-Audio-Cache"],
});

app.use("/api/*", async (c, next) => {
  // Let direct RFC 10008 OPTIONS discovery requests reach route handlers unless it's a CORS preflight
  if (c.req.method === "OPTIONS" && !c.req.header("Access-Control-Request-Method")) {
    await next();
    return;
  }
  return apiCors(c, next);
});

app.get("/api/health", (c) => c.json({ status: "UP", r2Enabled: Boolean(c.env.UPLOADS) }));

app.route("/api/profile", profileRoutes);
app.route("/api/reading", readingRoutes);
app.route("/api/homework", homeworkRoutes);
app.route("/api/audio", audioRoutes);
app.route("/api/progress", progressRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/mcp", mcpRoutes);

app.onError((err, c) => {
  const status = err.message.startsWith("Invalid ") ? 400 : 500;
  return c.json({ error: err.message }, status);
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
