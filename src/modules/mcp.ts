import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { getHomeworkSession, listHomeworkSessions } from "./homework";
import { getActiveProfile, resolveProfileId } from "./profile";
import { getProgress } from "./progress";

const jsonRpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().trim().min(1),
  params: z.record(z.unknown()).optional(),
});

const toolCallParamsSchema = z.object({
  name: z.string().trim().min(1),
  arguments: z.record(z.unknown()).optional().default({}),
});

const getHomeworkSessionArgsSchema = z.object({
  sessionId: z.number().int().positive(),
});

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
        sessionId: { type: "integer", description: "The numeric homework session ID" },
      },
      required: ["sessionId"],
    },
  },
];

export const mcpRoutes = new Hono<{ Bindings: Env }>();

mcpRoutes.post("/", async (c) => {
  const profileId = resolveProfileId(c.req.header("X-Profile-Id"));

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON body" },
      },
      400,
    );
  }

  const rpcParsed = jsonRpcSchema.safeParse(rawBody);
  if (!rpcParsed.success) {
    const rawId =
      rawBody && typeof rawBody === "object" && "id" in rawBody
        ? (rawBody as { id?: unknown }).id
        : null;
    const safeId = typeof rawId === "string" || typeof rawId === "number" ? rawId : null;
    return c.json(
      {
        jsonrpc: "2.0",
        id: safeId,
        error: { code: -32600, message: "Invalid Request" },
      },
      400,
    );
  }

  const rpc = rpcParsed.data;
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
    const paramsParsed = toolCallParamsSchema.safeParse(rpc.params ?? {});
    if (!paramsParsed.success) {
      return c.json(
        {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid params" },
        },
        400,
      );
    }

    const { name, arguments: args } = paramsParsed.data;
    let parsedSessionId: number | null = null;
    if (name === "getHomeworkSession") {
      const argsParsed = getHomeworkSessionArgsSchema.safeParse(args);
      if (!argsParsed.success) {
        return c.json(
          {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: sessionId must be a positive integer" },
          },
          400,
        );
      }
      parsedSessionId = argsParsed.data.sessionId;
    } else if (
      name !== "getLearnerProfile" &&
      name !== "getProgressAndTrickyWords" &&
      name !== "listHomeworkSessions"
    ) {
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      });
    }

    const profile = await getActiveProfile(c.env.DB, profileId);

    let payload: unknown;
    switch (name) {
      case "getLearnerProfile":
        payload = profile;
        break;
      case "getProgressAndTrickyWords":
        payload = await getProgress(c.env.DB, profile.id);
        break;
      case "listHomeworkSessions":
        payload = await listHomeworkSessions(c.env.DB, profile.id, {
          targetLanguageCode: profile.targetLanguageCode,
        });
        break;
      case "getHomeworkSession":
        payload = await getHomeworkSession(c.env.DB, profile.id, parsedSessionId!, {
          targetLanguageCode: profile.targetLanguageCode,
        });
        break;
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
