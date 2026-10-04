import { NextResponse } from "next/server";
import { isAuthorizedJudgingRequest } from "@/lib/judging/auth";
import { InvalidDebateError, parseDebateRequest } from "@/lib/judging/request";
import { judgeDebate } from "@/lib/judging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthorizedJudgingRequest(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Judging service is not configured." }, { status: 503 });
  }

  try {
    const debate = parseDebateRequest(await request.json());
    const result = await judgeDebate(debate);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof InvalidDebateError) {
      return NextResponse.json(
        { error: error instanceof InvalidDebateError ? error.message : "Request body must be valid JSON." },
        { status: 400 }
      );
    }
    console.error("Debate judging failed", error);
    return NextResponse.json({ error: "The judging service could not complete this debate." }, { status: 500 });
  }
}
