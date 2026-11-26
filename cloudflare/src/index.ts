import { Container, getContainer } from "@cloudflare/containers";

export interface Env {
  SOCRATIC: DurableObjectNamespace<SocraticContainer>;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  LITESTREAM_R2_BUCKET: string;
  LITESTREAM_R2_ENDPOINT: string;
  LITESTREAM_ACCESS_KEY_ID: string;
  LITESTREAM_SECRET_ACCESS_KEY: string;
}

export class SocraticContainer extends Container<Env> {
  override defaultPort = 8080;
  override sleepAfter = "15m";

  override envVars = {
    GEMINI_API_KEY: this.env.GEMINI_API_KEY,
    GEMINI_MODEL: this.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    LITESTREAM_R2_BUCKET: this.env.LITESTREAM_R2_BUCKET,
    LITESTREAM_R2_ENDPOINT: this.env.LITESTREAM_R2_ENDPOINT,
    LITESTREAM_ACCESS_KEY_ID: this.env.LITESTREAM_ACCESS_KEY_ID,
    LITESTREAM_SECRET_ACCESS_KEY: this.env.LITESTREAM_SECRET_ACCESS_KEY,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.SOCRATIC, "primary");
    return container.fetch(request);
  },
};
