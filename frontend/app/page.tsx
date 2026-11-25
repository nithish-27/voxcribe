import Link from "next/link";
import { Globe, History, Languages, Mic } from "lucide-react";

const features = [
  { icon: Mic, title: "Real-time transcription", text: "Words appear while you speak, streamed over WebSockets to Faster-Whisper." },
  { icon: Globe, title: "Multilingual recognition", text: "Hindi, Tamil, English and 90+ more languages, with mixed-language sentences kept as spoken." },
  { icon: Languages, title: "Automatic language detection", text: "No language picker. Detected languages are shown and saved with every transcript." },
  { icon: History, title: "Transcription history", text: "Search, filter, edit and export everything you have recorded." },
];

export default function Home() {
  return (
    <div className="py-10">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Voxcribe</h1>
        <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400">
          Your voice, instantly transformed into text.
        </p>
        <Link href="/transcribe" className="btn btn-primary mt-8 px-5 py-2.5">
          <Mic className="h-4 w-4" />
          Start Transcribing
        </Link>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card">
            <Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="muted mt-1">{text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-2xl text-center">
        <h2 className="text-xl font-semibold">How it works</h2>
        <p className="muted mt-2">
          Your browser captures microphone audio and streams it in small chunks to a private backend. A
          Whisper model transcribes it incrementally, so finished sentences are locked in while the
          latest words keep refining. Save the result and it lands in your history.
        </p>
      </section>
    </div>
  );
}
