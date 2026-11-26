import { Hono } from "hono";
import type { Env } from "../types";
import { getHomeworkSession, listHomeworkSessions } from "./homework";
import { DEFAULT_PROFILE_ID, getActiveProfile } from "./profile";
import { getProgress } from "./progress";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const MCP_TOOLS = [
  {
    name: "getLearnerProfile",
    description: "Get the active learner profile including name, age, target/native languages, and dialect rules.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getProgressAndTrickyWords",
    description: "Get the learner's stars, daily streak, pages read, and recently saved tricky words for quizzes or review.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "listHomeworkSessions",
    description: "List recent scanned homework sessions and each exercise's completion status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getHomeworkSession",
    description: "Get a specific homework session with all extracted exercises, explanations, tricky words, and ping-pong messages.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "number", description: "The numeric homework session ID" },
      },
      required: ["sessionId"],
    },
  },
];

export const mcpRoutes = new Hono<{ Bindings: Env }>();

mcpRoutes.post("/", async (c) => {
  const rpc = (await c.req.json()) as JsonRpcRequest;
  const id = rpc.id ?? null;

  if (rpc.method === "initialize") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "socratic", version: "1.0.0" },
      },
    });
  }

  if (rpc.method === "tools/list") {
    return c.json({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } });
  }

  if (rpc.method === "tools/call") {
    const name = String(rpc.params?.name ?? "");
    const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>;

    let payload: unknown;
    switch (name) {
      case "getLearnerProfile":
        payload = await getActiveProfile(c.env.DB, DEFAULT_PROFILE_ID);
        break;
      case "getProgressAndTrickyWords":
        payload = await getProgress(c.env.DB, DEFAULT_PROFILE_ID);
        break;
      case "listHomeworkSessions":
        payload = await listHomeworkSessions(c.env.DB, DEFAULT_PROFILE_ID);
        break;
      case "getHomeworkSession":
        payload = await getHomeworkSession(c.env.DB, DEFAULT_PROFILE_ID, Number(args.sessionId));
        break;
      default:
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        });
    }

    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      },
    });
  }

  return c.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unsupported method: ${rpc.method}` },
  });
});
