"use client";

import { useState } from "react";
import clsx from "clsx";
import { shareToDiscord, type ShareBody } from "@/lib/discord";

/**
 * 디스코드로 자랑하기 버튼. Once per session per payload, shows result
 * inline. No feedback state is persisted to DB.
 */
export default function ShareButton({
  body,
  label = "디스코드에 자랑하기",
  className,
}: {
  body: ShareBody;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);

  const click = async () => {
    if (state === "sending" || state === "ok") return;
    setState("sending");
    setErr(null);
    const res = await shareToDiscord(body);
    if (!res.ok) {
      setState("err");
      setErr(res.error ?? "실패");
      return;
    }
    setState("ok");
  };

  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={click}
        disabled={state === "sending" || state === "ok"}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "h-11 px-4 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition",
          state === "ok"
            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
            : state === "err"
            ? "bg-rose-500/20 text-rose-200 border border-rose-500/40"
            : "bg-[#5865F2] text-white hover:bg-[#4752c4] active:scale-[0.98]"
        )}
      >
        <DiscordIcon className="w-4 h-4" />
        {state === "sending"
          ? "보내는 중..."
          : state === "ok"
          ? "공유 완료!"
          : state === "err"
          ? "다시 시도"
          : label}
      </button>
      {state === "err" && err && (
        <p className="text-[10px] text-rose-300 leading-tight">{err}</p>
      )}
    </div>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.075.075 0 0 0-.079.037c-.34.61-.719 1.405-.983 2.034a18.34 18.34 0 0 0-5.491 0A12.75 12.75 0 0 0 9.016 3.24a.077.077 0 0 0-.08-.037A19.74 19.74 0 0 0 5.17 4.369a.07.07 0 0 0-.032.027C1.998 8.915.88 13.324 1.43 17.676a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.1 13.1 0 0 1-1.872-.891.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .371-.291.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.098.245.198.372.292a.077.077 0 0 1-.007.128 12.28 12.28 0 0 1-1.873.89.077.077 0 0 0-.04.107c.36.699.773 1.364 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.574-3.548-13.28a.061.061 0 0 0-.03-.027zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
