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

const SCORING_EVERY_MS = 15_000;
let lastScoring = 0;

/**
 * From a comp chat: ask the AI service to score waiting batches (or finish an
 * ended debate). Callers only call this when there's work; throttled per tab.
 */
export function requestScoring(googleIdToken: string | undefined) {
  const now = Date.now();
  if (!googleIdToken || now - lastScoring < SCORING_EVERY_MS) return;
  lastScoring = now;
  requestTopicTagging(googleIdToken);
}
