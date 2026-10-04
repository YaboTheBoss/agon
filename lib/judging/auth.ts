import "server-only";

import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

export async function isAuthorizedJudgingRequest(request: Request): Promise<boolean> {
  const internalKey = process.env.YAAPI_JUDGE_INTERNAL_KEY;
  const suppliedInternalKey = request.headers.get("x-yaapi-internal-key");
  if (internalKey && suppliedInternalKey && safelyEqual(internalKey, suppliedInternalKey)) return true;

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const authorization = request.headers.get("authorization");
  if (!clientId || !authorization?.startsWith("Bearer ")) return false;

  const idToken = authorization.slice("Bearer ".length).trim();
  if (!idToken) return false;

  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId });
    return Boolean(ticket.getPayload()?.sub);
  } catch {
    return false;
  }
}

function safelyEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}
