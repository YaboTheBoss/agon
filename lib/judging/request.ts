import type { DebateForJudging, DebatePhase, PlayerLabel } from "./types";

const MAX_TURNS = 200;
const MAX_TEXT_LENGTH = 6_000;
const MAX_TRANSCRIPT_LENGTH = 80_000;

export class InvalidDebateError extends Error {}

export function parseDebateRequest(value: unknown): DebateForJudging {
  if (!isRecord(value)) throw new InvalidDebateError("Request body must be an object.");
  rejectUnknownKeys(value, ["debateId", "topic", "positionA", "positionB", "contextCard", "turns"]);

  const debateId = requiredString(value.debateId, "debateId", 128);
  const topic = requiredString(value.topic, "topic", 500);
  const positionA = requiredString(value.positionA, "positionA", 1_000);
  const positionB = requiredString(value.positionB, "positionB", 1_000);
  const contextCard = optionalString(value.contextCard, "contextCard", 4_000);

  if (!Array.isArray(value.turns) || value.turns.length < 2 || value.turns.length > MAX_TURNS) {
    throw new InvalidDebateError(`turns must contain 2-${MAX_TURNS} messages.`);
  }

  const seenIds = new Set<string>();
  let transcriptLength = 0;
  const turns = value.turns.map((turn, index) => {
    if (!isRecord(turn)) throw new InvalidDebateError(`turns[${index}] must be an object.`);
    rejectUnknownKeys(turn, ["id", "phase", "speaker", "text"], `turns[${index}]`);
    const id = requiredString(turn.id, `turns[${index}].id`, 128);
    if (seenIds.has(id)) throw new InvalidDebateError(`Duplicate turn ID '${id}'.`);
    seenIds.add(id);
    const phase = enumValue(turn.phase, `turns[${index}].phase`, ["opening", "engagement", "closing"]);
    const speaker = enumValue(turn.speaker, `turns[${index}].speaker`, ["player_a", "player_b"]);
    const text = requiredString(turn.text, `turns[${index}].text`, MAX_TEXT_LENGTH);
    transcriptLength += text.length;
    return { id, phase: phase as DebatePhase, speaker: speaker as PlayerLabel, text };
  });

  if (transcriptLength > MAX_TRANSCRIPT_LENGTH) {
    throw new InvalidDebateError(`Transcript exceeds ${MAX_TRANSCRIPT_LENGTH} characters.`);
  }
  if (!turns.some((turn) => turn.speaker === "player_a") || !turns.some((turn) => turn.speaker === "player_b")) {
    throw new InvalidDebateError("The transcript must include both players.");
  }

  return { debateId, topic, positionA, positionB, ...(contextCard ? { contextCard } : {}), turns };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new InvalidDebateError(`${field} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field, max);
}

function enumValue(value: unknown, field: string, allowed: readonly string[]): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new InvalidDebateError(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: string[], path = "request"): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new InvalidDebateError(`${path} contains unknown field '${unknown[0]}'.`);
}
