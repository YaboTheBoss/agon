/**
 * Ask the server to AI-tag new topics (app/api/tagging). Fire-and-forget: the
 * topic already has keyword tags, so a slow or failed run never blocks posting.
 */
export function requestTopicTagging(googleIdToken: string | undefined) {
  if (!googleIdToken) return;
  fetch("/api/tagging", { method: "POST", headers: { Authorization: `Bearer ${googleIdToken}` } }).catch(() => {});
}
