// Vercel Connect — AI Agent connector (ai-agent/acme-ai-agent)
// Requests a short-lived token at runtime so agents can call external services
// without storing API keys in code. Runs on the server only.
import { getToken } from "@vercel/connect";

const CONNECTOR = "ai-agent/acme-ai-agent";

export interface ConnectTokenParams {
  subject: { type: "user"; id: string };
}

export async function getAiAgentToken(params: ConnectTokenParams) {
  return getToken(CONNECTOR, {
    subject: params.subject,
  });
}
