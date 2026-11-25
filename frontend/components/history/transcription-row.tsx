import Link from "next/link";
import { Clock, Pencil, Trash2, Type } from "lucide-react";
import { formatDate, formatDuration } from "@/lib/format";
import type { Transcription } from "@/types";

interface Props {
  item: Transcription;
  onDelete?: (item: Transcription) => void;
}

export function TranscriptionRow({ item, onDelete }: Props) {
  return (
    <div className="card flex items-start gap-4 transition-shadow hover:shadow-md">
      <Link href={`/history/${item.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-medium">{item.title}</h3>
          {item.detected_languages.map((l) => (
            <span key={l} className="badge">
              {l}
            </span>
          ))}
        </div>
        <p className="muted mt-1 line-clamp-2">{item.content || "(empty)"}</p>
        <div className="muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(item.duration_seconds)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Type className="h-3.5 w-3.5" />
            {item.word_count} words
          </span>
          <span>{formatDate(item.created_at)}</span>
        </div>
      </Link>
      <div className="flex gap-1">
        <Link href={`/history/${item.id}`} className="btn px-2" aria-label="View or edit">
          <Pencil className="h-4 w-4" />
        </Link>
        {onDelete && (
          <button className="btn px-2" aria-label="Delete" onClick={() => onDelete(item)}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
