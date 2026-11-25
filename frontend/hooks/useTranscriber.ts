"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/api";

export type Status = "idle" | "connecting" | "recording" | "paused" | "stopping";
export type Permission = "unknown" | "granted" | "denied";

const TARGET_RATE = 16000;
const SEND_EVERY_SECONDS = 0.5;
const BARS = 32;
// Runs on the audio thread; posts raw mono frames to the main thread.
const WORKLET = `class P extends AudioWorkletProcessor{process(i){const c=i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("pcm-capture",P)`;

/** Box-average downsample to 16 kHz (acts as a cheap low-pass) + float -> PCM16. */
function toPcm16(input: Float32Array, rate: number): Int16Array {
  const ratio = rate / TARGET_RATE;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = Math.max(-1, Math.min(1, sum / (end - start))) * 32767;
  }
  return out;
}

interface Refs {
  ws: WebSocket | null;
  ctx: AudioContext | null;
  stream: MediaStream | null;
  pending: Float32Array[];
  pendingLen: number;
  paused: boolean;
  lastLevel: number;
}

export function useTranscriber() {
  const [status, setStatus] = useState<Status>("idle");
  const [permission, setPermission] = useState<Permission>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));

  const r = useRef<Refs>({ ws: null, ctx: null, stream: null, pending: [], pendingLen: 0, paused: false, lastLevel: 0 });
  const doneResolve = useRef<(() => void) | null>(null);

  /** Idempotent: releases mic, audio graph and socket. */
  const release = useCallback(() => {
    const s = r.current;
    const { ws, ctx, stream } = s;
    s.ws = s.ctx = s.stream = null; // null first so ws.onclose knows this close was intentional
    s.pending = [];
    s.pendingLen = 0;
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    setLevels(Array(BARS).fill(0));
  }, []);

  const flushPending = useCallback(() => {
    const s = r.current;
    if (!s.pendingLen || !s.ctx) return;
    const merged = new Float32Array(s.pendingLen);
    let o = 0;
    for (const f of s.pending) {
      merged.set(f, o);
      o += f.length;
    }
    s.pending = [];
    s.pendingLen = 0;
    if (s.ws?.readyState === WebSocket.OPEN) s.ws.send(toPcm16(merged, s.ctx.sampleRate).buffer);
  }, []);

  useEffect(() => {
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        const sync = () => setPermission(p.state === "granted" ? "granted" : p.state === "denied" ? "denied" : "unknown");
        sync();
        p.onchange = sync;
      })
      .catch(() => {});
    return release;
  }, [release]);

  useEffect(() => {
    if (status !== "recording") return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000; // computed first: the updater runs after `last` is reassigned
      last = now;
      setElapsed((e) => e + dt);
    }, 250);
    return () => clearInterval(id);
  }, [status]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access needs HTTPS or localhost.");
      setStatus("idle");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      setPermission("granted");
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === "NotAllowedError") setPermission("denied");
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied. Allow access in your browser and try again."
          : name === "NotFoundError"
            ? "No microphone found."
            : "Could not access the microphone.",
      );
      setStatus("idle");
      return;
    }

    const ws = new WebSocket(`${WS_URL}/ws/transcribe/${crypto.randomUUID()}`);
    ws.binaryType = "arraybuffer";
    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("ws"));
      });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Cannot reach the transcription server.");
      setStatus("idle");
      return;
    }

    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "interim") setInterim(m.text);
      else if (m.type === "final") {
        setText((t) => (t ? `${t} ${m.text}` : m.text));
        setLanguages((l) => [...l, ...(m.languages as string[]).filter((x) => !l.includes(x))]);
      } else if (m.type === "error") {
        setError(m.message);
        if (m.fatal) {
          release();
          setStatus("idle");
          doneResolve.current?.();
        }
      } else if (m.type === "done") doneResolve.current?.();
    };
    ws.onclose = () => {
      if (r.current.ws !== ws) return; // intentional close
      release();
      setStatus("idle");
      setInterim("");
      setError("Connection lost. Press Start to continue; the text so far is kept.");
      doneResolve.current?.();
    };

    try {
      const ctx = new AudioContext();
      await ctx.resume();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      const mute = ctx.createGain(); // keeps the worklet pulled without playing the mic back
      mute.gain.value = 0;
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(mute).connect(ctx.destination);

      const s = r.current;
      Object.assign(s, { ws, ctx, stream, pending: [], pendingLen: 0, paused: false, lastLevel: 0 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const f = e.data;
        const now = performance.now();
        if (now - s.lastLevel > 80) {
          let sum = 0;
          for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
          s.lastLevel = now;
          const level = s.paused ? 0 : Math.min(1, Math.sqrt(sum / f.length) * 6);
          setLevels((l) => [...l.slice(1), level]);
        }
        if (s.paused) return;
        s.pending.push(f);
        s.pendingLen += f.length;
        if (s.pendingLen >= ctx.sampleRate * SEND_EVERY_SECONDS) flushPending();
      };
      setStatus("recording");
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      r.current.ws = null;
      ws.close();
      release();
      setError("Could not start audio capture in this browser.");
      setStatus("idle");
    }
  }, [flushPending, release]);

  const pause = useCallback(() => {
    flushPending();
    r.current.paused = true;
    r.current.ws?.send(JSON.stringify({ type: "pause" })); // server finalizes the live text
    setStatus("paused");
  }, [flushPending]);

  const resume = useCallback(() => {
    r.current.paused = false;
    setStatus("recording");
  }, []);

  const stop = useCallback(async () => {
    const ws = r.current.ws;
    if (!ws) return;
    setStatus("stopping");
    flushPending();
    r.current.paused = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 20000);
      doneResolve.current = () => {
        clearTimeout(timer);
        resolve();
      };
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
      else resolve();
    });
    release();
    setInterim("");
    setStatus("idle");
  }, [flushPending, release]);

  const reset = useCallback(() => {
    release();
    setText("");
    setInterim("");
    setLanguages([]);
    setElapsed(0);
    setError(null);
    setStatus("idle");
  }, [release]);

  return { status, permission, error, text, setText, interim, languages, elapsed, levels, start, pause, resume, stop, reset };
}
