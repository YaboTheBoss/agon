"use client";

/**
 * Detailed chat — spectators read a conversation between two other users.
 * Comp (challenge) chats show the point comparison + Live/Ended at the top;
 * casual chats don't have either.
 * Bottom bar: pick a side (and get paired as a new opponent) + like the conversation.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import type { Choice } from "@/lib/data";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  AISummary, Avatar, Icon, Loading, ModeTag, PairingOverlay, PageHeader, PollBar, SIDE_COLOR, SIDE_TINT, ScoreBar, SignInDialog, displayFont, press, usePairing,
} from "@/components/ui";

export default function ConvoPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, convoById, convosForTopic, topicById, likedChatIds, myVotes, actions } = useStore();
  const convo = convoById(id);
  const topic = convo ? topicById.get(convo.topicId) : undefined;
  const { pairing, startPairing, cancelPairing } = usePairing();
  const { status } = useAuth();
  const [askSignIn, setAskSignIn] = useState(false);

  if (!ready) {
    return (
      <>
        <PageHeader title="Chat" back="/" />
        <Loading />
      </>
    );
  }

  if (!convo || !topic) {
    return (
      <>
        <PageHeader title="Chat not found" back="/" />
        <p className="p-6 text-center font-semibold text-[#5E5A72]">This conversation doesn&apos;t exist (yet).</p>
      </>
    );
  }

  const comp = convo.mode === "comp";
  const others = convosForTopic(topic.id).length - 1;
  const liked = likedChatIds.has(convo.id);
  const likes = convo.likes;
  const nextUp = convo.messages.at(-1)?.side === "a" ? convo.b : convo.a;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader back="/" title={<span className="text-xl">{topic.title}</span>} sub={`${convo.a} vs ${convo.b}`} right={<ModeTag mode={convo.mode} />} />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 pb-6 pt-4">
        {comp && convo.scores && convo.status ? (
          <ScoreBar
            status={convo.status}
            left={{ name: convo.a, side: "a", label: topic.sideA, score: convo.scores.a }}
            right={{ name: convo.b, side: "b", label: topic.sideB, score: convo.scores.b }}
          />
        ) : (
          <div className="flex items-center justify-between gap-2 text-xs font-extrabold">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={convo.a} size={30} color={SIDE_COLOR.a} />
              <span className="truncate rounded-full border-2 border-[#1E1B2E] px-2 py-0.5" style={{ background: SIDE_COLOR.a }}>
                {convo.a} · {topic.sideA}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate rounded-full border-2 border-[#1E1B2E] px-2 py-0.5" style={{ background: SIDE_COLOR.b }}>
                {convo.b} · {topic.sideB}
              </span>
              <Avatar name={convo.b} size={30} color={SIDE_COLOR.b} />
            </span>
          </div>
        )}

        {convo.summary && <AISummary text={convo.summary} />}

        {/* transcript */}
        <ol className="space-y-3" aria-label="Conversation">
          {convo.messages.map((m) => {
            const isA = m.side === "a";
            return (
              <li key={m.id} className={`flex items-end gap-2 ${isA ? "" : "flex-row-reverse"}`}>
                <Avatar name={isA ? convo.a : convo.b} size={30} color={SIDE_COLOR[m.side]} />
                <p
                  className={`max-w-[78%] rounded-[20px] border-2 border-[#1E1B2E] px-4 py-2.5 text-[15px] leading-snug shadow-[2px_2px_0_#1E1B2E] ${
                    isA ? "rounded-bl-md" : "rounded-br-md"
                  }`}
                  style={{ background: SIDE_TINT[m.side] }}
                >
                  <span className="sr-only">{isA ? convo.a : convo.b}: </span>
                  {m.text}
                </p>
              </li>
            );
          })}
        </ol>

        {comp && convo.status === "live" && (
          <p className="flex items-center justify-center gap-2 text-xs font-bold text-[#5E5A72]">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5E5A72]" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            {nextUp}&apos;s turn
          </p>
        )}

        {others > 0 && (
          <Link
            href={`/topics/${topic.id}`}
            className={`flex min-h-[52px] items-center justify-between rounded-2xl border-2 border-[#1E1B2E] bg-white px-4 font-extrabold shadow-[3px_3px_0_#1E1B2E] ${press}`}
          >
            {others} more chat{others > 1 ? "s" : ""} on this topic
            <Icon name="arrow" />
          </Link>
        )}
      </main>

      {/* spectator bar: pick a side + like */}
      <div className="sticky bottom-0 z-20 border-t-2 border-[#1E1B2E] bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl items-end gap-3 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <p className={`${displayFont} mb-1.5 text-sm`}>Which side are you on? Pick one to jump in.</p>
            <PollBar topic={topic} picked={(myVotes.get(topic.id) as Choice | undefined) ?? null} onPick={(choice) => startPairing({ topic, choice, mode: convo.mode })} />
          </div>
          <button
            onClick={() => (status === "signed-in" ? actions.toggleLike(convo.id).catch(console.error) : setAskSignIn(true))}
            aria-pressed={liked}
            aria-label={liked ? "Unlike conversation" : "Like conversation"}
            className={`flex h-[56px] min-w-[60px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-[#1E1B2E] text-xs font-black shadow-[3px_3px_0_#1E1B2E] ${press} ${
              liked ? "bg-[#FF8FB1]" : "bg-white"
            }`}
          >
            <Icon name="thumb" className={`h-5 w-5 transition-transform ${liked ? "-rotate-12 scale-110" : ""}`} />
            {likes}
          </button>
        </div>
      </div>

      {pairing && <PairingOverlay pairing={pairing} onCancel={cancelPairing} />}
      {askSignIn && <SignInDialog why="Sign in with Google to like conversations." onClose={() => setAskSignIn(false)} />}
    </div>
  );
}
