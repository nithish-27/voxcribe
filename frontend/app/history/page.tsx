"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { TranscriptionRow } from "@/components/history/transcription-row";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import type { Transcription, TranscriptionPage } from "@/types";

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [language, setLanguage] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [data, setData] = useState<TranscriptionPage | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Transcription | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    api.languages().then(setLanguages).catch(() => {});
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .list({ page, page_size: PAGE_SIZE, q: debouncedQ, language, date_from: dateFrom, date_to: dateTo, sort })
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [page, debouncedQ, language, dateFrom, dateTo, sort, reload]);

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.remove(toDelete.id);
      setToDelete(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">History</h1>
        <Link href="/transcribe" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          New transcription
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            className="input pl-9"
            placeholder="Search title or text…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
        </div>
        <select className="input" value={language} onChange={(e) => filter(setLanguage)(e.target.value)} aria-label="Language">
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
        <input type="date" className="input" value={dateFrom} onChange={(e) => filter(setDateFrom)(e.target.value)} aria-label="From date" />
        <input type="date" className="input" value={dateTo} onChange={(e) => filter(setDateTo)(e.target.value)} aria-label="To date" />
        <select className="input" value={sort} onChange={(e) => filter(setSort)(e.target.value as "newest" | "oldest")} aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {error && (
        <div className="card flex items-center justify-between border-red-300 text-sm text-red-600 dark:border-red-900 dark:text-red-400">
          {error}
          <button className="btn" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className="space-y-3">
        {!data && !error && [0, 1, 2].map((i) => <div key={i} className="card h-24 animate-pulse" />)}
        {data?.items.length === 0 && (
          <div className="card muted py-10 text-center">
            {debouncedQ || language || dateFrom || dateTo ? "No transcriptions match these filters." : "No transcriptions yet."}
          </div>
        )}
        {data?.items.map((t) => <TranscriptionRow key={t.id} item={t} onDelete={setToDelete} />)}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete transcription?"
        message={`"${toDelete?.title ?? ""}" will be permanently deleted.`}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
