import { NextResponse } from "next/server";
import { isAuthorizedJudgingRequest } from "@/lib/judging/auth";
import { generateConvoSummary, generateTopicFeatures } from "@/lib/tagging/gemini";
import { TaggingNotConfiguredError, runAiUpkeep } from "@/lib/tagging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI upkeep: tag topics that only have keyword tags (tags, tone, entities) and
 * summarise ended conversations that have no summary yet.
 * Called by the app after someone creates a topic or opens View yaaps, with
 * their Google ID token (or by a backend with the internal key — same check as
 * judging). The request carries no data: what gets processed, and how, is
 * decided server-side.
 */
export async function POST(request: Request) {
  if (!(await isAuthorizedJudgingRequest(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Tagging service is not configured." }, { status: 503 });
  }

  try {
    const run = await runAiUpkeep({ features: generateTopicFeatures, summary: generateConvoSummary });
    if (run.topics.failed.length) console.error("Topic tagging failures", run.topics.failed);
    if (run.summaries.failed.length) console.error("Conversation summary failures", run.summaries.failed);
    return NextResponse.json(run, { status: 200 });
  } catch (error) {
    if (error instanceof TaggingNotConfiguredError) {
      return NextResponse.json({ error: "Tagging service is not configured." }, { status: 503 });
    }
    console.error("Topic tagging failed", error);
    return NextResponse.json({ error: "Tagging failed." }, { status: 500 });
  }
}
