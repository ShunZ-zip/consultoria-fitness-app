import type { ReactNode } from "react";

// Ícones de traço (24×24, currentColor) com microanimações: reagem ao hover/foco/toque do botão ou link que os contém
// (a animação está no CSS e respeita "reduzir movimento"). `enter` desenha o ícone ao aparecer; `spin` gira (sincronizando).
export type IconName = "dumbbell" | "chart" | "chat" | "clipboard" | "pulse" | "book" | "eye" | "eye-off" | "check" | "refresh" | "timer" | "trophy" | "play" | "card" | "shield" | "user" | "arrow-left" | "plus" | "sparkle" | "sun" | "moon";

const P: Record<IconName, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  dumbbell: <g className="i-wiggle"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></g>,
  chart: <><path d="M3 21h18" /><path className="i-draw" pathLength={1} d="M3 16l5-5 4 4 8-9" /></>,
  chat: <><path className="i-pop" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><circle className="i-dot d1" cx="8.5" cy="12" r=".9" /><circle className="i-dot d2" cx="12" cy="12" r=".9" /><circle className="i-dot d3" cx="15.5" cy="12" r=".9" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v2.5H9z" /><path className="i-draw" pathLength={1} d="M9 13.5l2 2 4-4" /></>,
  pulse: <><path className="i-beat" d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z" /><path className="i-draw" pathLength={1} d="M5 12h3l1.5-2.5 2.5 5 1.5-2.5H19" /></>,
  book: <g className="i-tilt"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></g>,
  eye: <g className="i-blink"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></g>,
  "eye-off": <g className="i-blink"><path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></g>,
  check: <path className="i-draw i-keep" pathLength={1} d="M5 12.5l4.5 4.5L19 7" />,
  refresh: <g className="i-turn"><path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4" /><path d="M20 4v7h-7M4 20v-7h7" /></g>,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M9.5 2.5h5" /><path className="i-hand" d="M12 13.5V9.5" /></>,
  trophy: <g className="i-pop"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></g>,
  play: <><circle cx="12" cy="12" r="9" /><path className="i-pop" d="M10 8.5l5.5 3.5-5.5 3.5z" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path className="i-slide" d="M6.5 15h4" /></>,
  shield: <><path className="i-pop" d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path className="i-draw" pathLength={1} d="M9 12l2 2 4-4" /></>,
  user: <><circle className="i-pop" cx="12" cy="8" r="4" /><path d="M4 21c1.2-4 4.2-6 8-6s6.8 2 8 6" /></>,
  "arrow-left": <path className="i-nudge" d="M19 12H5M11 6l-6 6 6 6" />,
  plus: <g className="i-turn-q"><path d="M12 5v14M5 12h14" /></g>,
  sparkle: <path className="i-pop" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
};

export default function Icon({ name, size, enter, spin, className = "" }: { name: IconName; size?: number | string; enter?: boolean; spin?: boolean; className?: string }) {
  return (
    <svg className={`ic ic-${name}${enter ? " ic-enter" : ""}${spin ? " ic-spin" : ""} ${className}`.trim()} viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  );
}
