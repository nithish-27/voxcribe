"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Eraser, FileText, Mic, Pause, Play, Save, Square, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranscriber } from "@/hooks/useTranscriber";
import { api } from "@/lib/api";
import { downloadTxt, printPdf } from "@/lib/export";
import { formatDuration } from "@/lib/format";

const PERMISSION_LABEL = { unknown: "Not requested yet", granted: "Granted", denied: "Blocked" } as const;

export default function TranscribePage() {
  const t = useTranscriber();
  const router = useRouter();
  const editor = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const live = t.status === "recording" || t.status === "paused";
  const busy = t.status === "connecting" || t.status === "stopping";
  const hasText = t.text.trim().length > 0;

  // Keep the newest text in view while recording.
  useEffect(() => {
    if (editor.current) editor.current.scrollTop = editor.current.scrollHeight;
  }, [t.text, t.interim]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.create({
        content: t.text.trim(),
        detected_languages: t.languages,
        duration_seconds: Math.round(t.elapsed),
      });
      t.reset();
      router.push(`/history/${saved.id}`);
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(t.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Transcribe</h1>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {t.status === "idle" || busy ? (
            <button className="btn btn-primary" onClick={t.start} disabled={busy}>
              <Mic className="h-4 w-4" />
              {t.status === "connecting" ? "Connecting…" : "Start Recording"}
            </button>
          ) : t.status === "recording" ? (
            <button className="btn" onClick={t.pause}>
              <Pause className="h-4 w-4" />
              Pause
            </button>
          ) : (
            <button className="btn btn-primary" onClick={t.resume}>
              <Play className="h-4 w-4" />
              Resume
            </button>
          )}
          <button className="btn" onClick={t.stop} disabled={!live}>
            <Square className="h-4 w-4" />
            {t.status === "stopping" ? "Finishing…" : "Stop"}
          </button>

          <div className="ml-auto flex items-center gap-4">
            <div className="flex h-8 items-center gap-0.5" aria-label="Audio level">
              {t.levels.map((v, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-violet-500 transition-[height] duration-100"
                  style={{ height: 4 + v * 28 }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  t.status === "recording" ? "animate-pulse bg-red-500" : "bg-neutral-300 dark:bg-neutral-700"
                }`}
              />
              {formatDuration(t.elapsed)}
            </div>
          </div>
        </div>
        <p className="muted text-xs">
          Microphone: {PERMISSION_LABEL[t.permission]} ·{" "}
          {t.status === "recording" ? "Recording" : t.status === "paused" ? "Paused" : "Idle"}
        </p>
        {t.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {t.error}
          </p>
        )}
      </div>

      <div className="card space-y-3">
        <textarea
          ref={editor}
          value={t.text}
          onChange={(e) => t.setText(e.target.value)}
          placeholder="Press Start Recording and speak. Text appears here and stays editable."
          className="input h-72 resize-y leading-relaxed"
          spellCheck={false}
        />
        <div className="min-h-6 text-sm italic text-violet-600 dark:text-violet-400" aria-live="polite">
          {t.interim || (t.status === "recording" ? "Listening…" : "")}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {t.languages.length ? (
              t.languages.map((l) => (
                <span key={l} className="badge">
                  {l}
                </span>
              ))
            ) : (
              <span className="muted text-xs">Language detected automatically</span>
            )}
          </div>
          <span className="muted text-xs">
            {hasText ? t.text.trim().split(/\s+/).length : 0} words · {t.text.length} characters
          </span>
        </div>
      </div>

      {saveError && <p className="text-sm text-red-600 dark:text-red-400">Save failed: {saveError}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={save} disabled={!hasText || live || busy || saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn" onClick={() => t.setText("")} disabled={!hasText || live}>
          <Eraser className="h-4 w-4" />
          Clear
        </button>
        <button className="btn" onClick={copy} disabled={!hasText}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn" onClick={() => downloadTxt("transcription", t.text)} disabled={!hasText}>
          <Download className="h-4 w-4" />
          TXT
        </button>
        <button className="btn" onClick={() => printPdf("Transcription", t.text)} disabled={!hasText}>
          <FileText className="h-4 w-4" />
          PDF
        </button>
        <button className="btn ml-auto" onClick={() => setConfirmDiscard(true)} disabled={(!hasText && !live) || saving}>
          <Trash2 className="h-4 w-4" />
          Discard
        </button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this transcription?"
        message="The recording and its text will be lost. This cannot be undone."
        confirmLabel="Discard"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          t.reset();
          setConfirmDiscard(false);
        }}
      />
    </div>
  );
}
