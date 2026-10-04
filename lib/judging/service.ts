import "server-only";

import { geminiJudgingDependencies } from "./gemini";
import { runJudgingPipeline } from "./runner";
import type { DebateForJudging } from "./types";

export function judgeDebate(debate: DebateForJudging) {
  return runJudgingPipeline(debate, geminiJudgingDependencies);
}
