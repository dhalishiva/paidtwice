"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { loadFile, loadSample, useScan } from "@/lib/scan-store";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="2.5" y="7" width="11" height="7.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function DropZone({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { error, phase } = useScan();
  const busy = phase === "reading";

  const go = () => {
    if (pathname !== "/scan") router.push("/scan");
  };

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void loadFile(file);
    go();
  };

  return (
    <div
      className={`dropzone ${compact ? "p-5" : "p-5 sm:p-7"}`}
      data-over={over}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
    >
      <p className="text-lg font-bold">Drop your accounts payable export here</p>
      <p className="mt-1 text-[0.9375rem] text-ink-2">CSV or Excel. A bill list, vendor ledger or payment report works best.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose a file
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            void loadSample();
            go();
          }}
        >
          Try the sample file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            pick(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />
      </div>
      <p className="mt-5 flex items-center gap-2 text-sm text-green-ink">
        <LockIcon />
        Read on your computer. Never uploaded.
      </p>
      {error && phase === "idle" && (
        <p role="alert" className="error-text mt-3 text-[0.9375rem]">
          {error}
        </p>
      )}
    </div>
  );
}
