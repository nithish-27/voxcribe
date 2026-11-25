export interface Transcription {
  id: string;
  title: string;
  content: string;
  detected_languages: string[];
  duration_seconds: number;
  word_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionPage {
  items: Transcription[];
  total: number;
  page: number;
  page_size: number;
}

export interface DashboardStats {
  total_transcriptions: number;
  total_words: number;
  total_duration_seconds: number;
  latest: Transcription | null;
}

export interface ListParams {
  page?: number;
  page_size?: number;
  q?: string;
  language?: string;
  date_from?: string;
  date_to?: string;
  sort?: "newest" | "oldest";
}

export interface CreatePayload {
  title?: string;
  content: string;
  detected_languages: string[];
  duration_seconds: number;
}
