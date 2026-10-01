/** Two tick marks: paid once in ink, paid again in red pencil. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 24) / 34} viewBox="0 0 34 24" aria-hidden="true" focusable="false">
      <path d="M2.5 12.5l6 6.5L21 3.5" fill="none" stroke="#14213d" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 12.5l6 6.5L31 3.5" fill="none" stroke="#c2362b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-[780] tracking-[-0.02em] text-[1.2rem]">
      <LogoMark />
      PaidTwice
    </span>
  );
}
