/**
 * Ask the server to AI-tag new topics (app/api/tagging). Fire-and-forget: the
 * topic already has keyword tags, so a slow or failed run never blocks posting.
 */
export function requestTopicTagging(googleIdToken: string | undefined) {
  if (!googleIdToken) return;
  fetch("/api/tagging", { method: "POST", headers: { Authorization: `Bearer ${googleIdToken}` } }).catch(() => {});
}

const UPKEEP_EVERY_MS = 5 * 60_000;
let lastUpkeep = 0;

/**
 * Same route, from View yaaps: lets finished conversations get their AI summary
 * (casual chats end on the server with nobody watching). At most every 5 minutes
 * per tab.
 */
export function requestAiUpkeep(googleIdToken: string | undefined) {
  const now = Date.now();
  if (!googleIdToken || now - lastUpkeep < UPKEEP_EVERY_MS) return;
  lastUpkeep = now;
  requestTopicTagging(googleIdToken);
}
