/**
 * Google sign-in.
 *
 * Clients connect with a Google ID token. SpacetimeDB checks the token's
 * signature and expiry; we still have to check it was issued by Google *for
 * this app* (issuer + audience), otherwise any Google-issued token would do.
 *
 * Anonymous connections (SpacetimeDB-issued tokens) are allowed so people can
 * browse, but they never get a player row and can't call write reducers.
 */

/**
 * OAuth client IDs allowed to sign in (Google Cloud Console → APIs & Services →
 * Credentials). Must match NEXT_PUBLIC_GOOGLE_CLIENT_ID in the web app.
 * Client IDs aren't secret, so it's fine to commit them.
 */
const GOOGLE_CLIENT_IDS: string[] = ['53047806619-1g7q2kud469mkfd6le4c7c2kba89cpjb.apps.googleusercontent.com'];

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

type Claims = {
  issuer: string;
  audience: readonly string[];
  fullPayload: Record<string, unknown>;
};

export type GoogleUser = { name: string };

/**
 * "google" — a valid Google token for this app; "other-google" — a Google token
 * for some other client ID (reject); "anonymous" — anything else.
 */
export function classifyLogin(jwt: Claims | null): { kind: 'google'; user: GoogleUser } | { kind: 'other-google' } | { kind: 'anonymous' } {
  if (!jwt || !GOOGLE_ISSUERS.includes(jwt.issuer)) return { kind: 'anonymous' };
  if (!jwt.audience.some(aud => GOOGLE_CLIENT_IDS.includes(aud))) return { kind: 'other-google' };
  const p = jwt.fullPayload;
  const raw = (typeof p.given_name === 'string' && p.given_name) || (typeof p.name === 'string' && p.name) || 'Player';
  return { kind: 'google', user: { name: raw.trim().slice(0, 24) || 'Player' } };
}
