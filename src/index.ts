import { Hono } from "hono";
import { cors } from "hono/cors";
import { audioRoutes } from "./modules/audio";
import { homeworkRoutes } from "./modules/homework";
import { mcpRoutes } from "./modules/mcp";
import { profileRoutes } from "./modules/profile";
import { progressRoutes } from "./modules/progress";
import { readingRoutes } from "./modules/reading";
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

app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ status: "UP" }));

app.route("/api/profile", profileRoutes);
app.route("/api/reading", readingRoutes);
app.route("/api/homework", homeworkRoutes);
app.route("/api/audio", audioRoutes);
app.route("/api/progress", progressRoutes);
app.route("/mcp", mcpRoutes);

app.onError((err, c) => {
  const status = err.message.startsWith("Invalid ") ? 400 : 500;
  return c.json({ error: err.message }, status);
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
