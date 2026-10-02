"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { needsFreshPageForPrivate } from "@/lib/analytics";
import { stashFile } from "@/lib/handoff";
import { fileSizeProblem, loadFile, loadSample, showIdleError, useScan } from "@/lib/scan-store";

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
  const [opening, setOpening] = useState(false);
  const { error, phase } = useScan();
  const busy = phase === "reading" || opening;
  const onScanPage = pathname === "/scan";

  // Coming back with the browser's Back button restores this page as it was left.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setOpening(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const go = () => {
    if (!onScanPage) router.push("/scan");
  };

  // When Google Analytics is configured, a page that was first loaded as a public page carries a
  // policy that allows Google's hosts, so the file is not read here: it is handed to a freshly
  // loaded scan page, which runs with the strict policy and no third-party script.
  const freshScanPage = !onScanPage && needsFreshPageForPrivate();

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!freshScanPage) {
      void loadFile(file);
      go();
      return;
    }
    const problem = fileSizeProblem(file);
    if (problem) {
      showIdleError(problem);
      return;
    }
    setOpening(true);
    void stashFile(file).then((key) =>
      window.location.assign(key ? `/scan?handoff=${encodeURIComponent(key)}` : "/scan?handoff=failed"),
    );
  };

  const sample = () => {
    if (freshScanPage) {
      setOpening(true);
      window.location.assign("/scan?sample=1");
      return;
    }
    void loadSample();
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
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={sample}>
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
      <p className="mt-5 flex items-center gap-2 text-sm text-green-ink" role={opening ? "status" : undefined}>
        <LockIcon />
        {opening ? "Opening the scanner…" : "Read on your computer. Never uploaded."}
      </p>
      {error && phase === "idle" && (
        <p role="alert" className="error-text mt-3 text-[0.9375rem]">
          {error}
        </p>
      )}
    </div>
  );
}
