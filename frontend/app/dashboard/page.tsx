"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { TranscriptionRow } from "@/components/history/transcription-row";
import { api } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import type { DashboardStats, Transcription } from "@/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Transcription[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.list({ page_size: 5 })])
      .then(([s, p]) => {
        setStats(s);
        setRecent(p.items);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const cards = [
    { label: "Transcriptions", value: stats?.total_transcriptions.toLocaleString() },
    { label: "Words transcribed", value: stats?.total_words.toLocaleString() },
    { label: "Recording time", value: stats && formatDuration(stats.total_duration_seconds) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/transcribe" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          New transcription
        </Link>
      </div>

      {error && (
        <div className="card border-red-300 text-sm text-red-600 dark:border-red-900 dark:text-red-400">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="muted">{c.label}</p>
            {c.value ? (
              <p className="mt-1 text-2xl font-semibold">{c.value}</p>
            ) : (
              <div className="mt-2 h-7 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            )}
          </div>
        ))}
        <div className="card">
          <p className="muted">Latest session</p>
          {stats ? (
            stats.latest ? (
              <Link href={`/history/${stats.latest.id}`} className="mt-1 block">
                <p className="truncate font-medium">{stats.latest.title}</p>
                <p className="muted text-xs">{formatDate(stats.latest.created_at)}</p>
              </Link>
            ) : (
              <p className="muted mt-1">None yet</p>
            )
          ) : (
            <div className="mt-2 h-7 w-28 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          )}
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent transcriptions</h2>
          <Link href="/history" className="muted hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-3">
          {recent === null && !error && <div className="card h-24 animate-pulse" />}
          {recent?.length === 0 && (
            <div className="card muted text-center">No transcriptions yet. Record your first one.</div>
          )}
          {recent?.map((t) => <TranscriptionRow key={t.id} item={t} />)}
        </div>
      </section>
    </div>
  );
}
