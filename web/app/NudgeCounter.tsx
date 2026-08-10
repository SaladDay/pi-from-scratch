"use client";

import { useEffect, useRef, useState } from "react";
import BellRing from "lucide-react/dist/esm/icons/bell-ring.mjs";

const counterApi = "https://countapi.mileshilliard.com/api/v1";
const counterKey = "pi_from_scratch_future_articles_nudge_v1";

type CounterResponse = {
  value?: number | string;
};

function countLabel(count: number | null): string {
  if (count === null) return "正在读取大家留下的催更…";
  if (count < 10) return "每一下都会留在这里";
  if (count < 50) return "作者已经听见敲桌声了";
  if (count < 100) return "键盘开始有点烫了";
  return "这个数字已经没法装没看见了";
}

async function readCount(increment: boolean): Promise<number> {
  const operation = increment ? "hit" : "get";
  const url = `${counterApi}/${operation}/${counterKey}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!increment && response.status === 404) return 0;
  if (!response.ok) throw new Error("counter request failed");
  const data = await response.json() as CounterResponse;
  const value = Number(data.value);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid counter response");
  return value;
}

export default function NudgeCounter() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const bellRef = useRef<SVGSVGElement>(null);
  const plusRef = useRef<HTMLSpanElement>(null);
  const bellAnimationRef = useRef<Animation | null>(null);
  const plusAnimationRef = useRef<Animation | null>(null);

  useEffect(() => {
    let alive = true;
    readCount(false)
      .then((value) => {
        if (alive) setCount(value);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      bellAnimationRef.current?.cancel();
      plusAnimationRef.current?.cancel();
    };
  }, []);

  const playFeedback = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    bellAnimationRef.current?.cancel();
    plusAnimationRef.current?.cancel();
    bellAnimationRef.current = bellRef.current?.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-18deg)", offset: .3 },
        { transform: "rotate(14deg)", offset: .58 },
        { transform: "rotate(-7deg)", offset: .82 },
        { transform: "rotate(0deg)" },
      ],
      { duration: 360, easing: "cubic-bezier(.16, 1, .3, 1)" },
    ) ?? null;
    plusAnimationRef.current = plusRef.current?.animate(
      [
        { opacity: 0, transform: "translateY(5px) scale(.8)" },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: .24 },
        { opacity: 0, transform: "translateY(-12px) scale(1.05)" },
      ],
      { duration: 520, easing: "cubic-bezier(.16, 1, .3, 1)" },
    ) ?? null;
  };

  const nudge = () => {
    playFeedback();
    setFailed(false);
    readCount(true)
      .then((value) => setCount((current) => current === null ? value : Math.max(current, value)))
      .catch(() => setFailed(true));
  };

  const formattedCount = count === null
    ? "—"
    : new Intl.NumberFormat("zh-CN", count >= 10_000
      ? { notation: "compact", maximumFractionDigits: 1 }
      : undefined).format(count);

  return (
    <aside className="nudge-card" aria-labelledby="nudge-title">
      <div className="nudge-copy">
        <span className="nudge-kicker">想看下一篇？</span>
        <p id="nudge-title"><strong>{formattedCount}</strong><span> 次催更留在了这里</span></p>
        <small>{failed ? "刚才那一下没记上，再试试" : countLabel(count)}</small>
      </div>
      <button className="nudge-button" type="button" onClick={nudge}>
        <BellRing ref={bellRef} size={17} aria-hidden="true" />
        <span>{count === null || count === 0 ? "催一下" : "再催一下"}</span>
        <span ref={plusRef} className="nudge-plus" aria-hidden="true">+1</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {failed ? "催更没有记录成功" : count === null ? "正在读取催更次数" : `当前共有 ${count} 次催更`}
      </span>
    </aside>
  );
}
