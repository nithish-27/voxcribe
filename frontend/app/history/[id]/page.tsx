"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Download, FileText, Save, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { downloadTxt, printPdf } from "@/lib/export";
import { formatDate, formatDuration } from "@/lib/format";
import type { Transcription } from "@/types";

export default function TranscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Transcription | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .get(id)
      .then((t) => {
        setItem(t);
        setTitle(t.title);
        setContent(t.content);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const dirty = item !== null && (title !== item.title || content !== item.content);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.update(id, { title, content });
      setItem(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.remove(id);
      router.push("/history");
    } catch (e) {
      setError((e as Error).message);
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!item) {
    return error ? (
      <div className="card text-sm text-red-600 dark:text-red-400">
        {error} <Link href="/history" className="underline">Back to history</Link>
      </div>
    ) : (
      <div className="card h-64 animate-pulse" />
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/history" className="muted inline-flex items-center gap-1 hover:underline">
        <ArrowLeft className="h-4 w-4" />
        History
      </Link>

      <div className="card space-y-4">
        <input className="input text-lg font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" maxLength={200} />
        <div className="muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {item.detected_languages.map((l) => (
            <span key={l} className="badge">
              {l}
            </span>
          ))}
          <span>{formatDuration(item.duration_seconds)}</span>
          <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
          <span>{content.length} characters</span>
          <span>{formatDate(item.created_at)}</span>
        </div>
        <textarea className="input h-96 resize-y leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} aria-label="Content" spellCheck={false} />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={save} disabled={!dirty || !title.trim() || saving}>
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
        <button className="btn" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn" onClick={() => downloadTxt(title, content)}>
          <Download className="h-4 w-4" />
          TXT
        </button>
        <button className="btn" onClick={() => printPdf(title, content)}>
          <FileText className="h-4 w-4" />
          PDF
        </button>
        <button className="btn ml-auto" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete transcription?"
        message={`"${item.title}" will be permanently deleted.`}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </div>
  );
}
