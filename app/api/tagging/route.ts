import { NextResponse } from "next/server";
import { isAuthorizedJudgingRequest } from "@/lib/judging/auth";
import { generateTopicFeatures } from "@/lib/tagging/gemini";
import { TaggingNotConfiguredError, tagPendingTopics } from "@/lib/tagging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tag topics that only have keyword tags with AI (tags, tone, entities).
 * Called by the app after someone creates a topic, with their Google ID token
 * (or by a backend with the internal key — same check as judging). The request
 * carries no topic data: what gets tagged, and how, is decided server-side.
 */
export async function POST(request: Request) {
  if (!(await isAuthorizedJudgingRequest(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Tagging service is not configured." }, { status: 503 });
  }

  try {
    const run = await tagPendingTopics(generateTopicFeatures);
    if (run.failed.length) console.error("Topic tagging failures", run.failed);
    return NextResponse.json(run, { status: 200 });
  } catch (error) {
    if (error instanceof TaggingNotConfiguredError) {
      return NextResponse.json({ error: "Tagging service is not configured." }, { status: 503 });
    }
    console.error("Topic tagging failed", error);
    return NextResponse.json({ error: "Tagging failed." }, { status: 500 });
  }
}
