"use client";
import { apiFetch } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
export function PrivatePlayer({
  url,
  segments = [],
  audio = false,
  start = 0,
  highlight = [],
}: {
  url?: string | null;
  segments?: {
    id: string;
    text_content: string | null;
    start_ms: number | null;
    end_ms: number | null;
  }[];
  audio?: boolean;
  start?: number;
  highlight?: string[];
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [captions, setCaptions] = useState<string>();
  useEffect(() => {
    if (!segments.length) return;
    const format = (ms: number) => new Date(ms).toISOString().slice(11, 23);
    const vtt =
      "WEBVTT\n\n" +
      segments
        .map(
          (s) =>
            format(s.start_ms ?? 0) +
            " --> " +
            format(s.end_ms ?? 0) +
            "\n" +
            (s.text_content ?? "").replace(/-->/g, "→"),
        )
        .join("\n\n");
    const object = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    // URL is tied to this evidence snapshot and revoked on replacement.
    queueMicrotask(() => setCaptions(object));
    return () => URL.revokeObjectURL(object);
  }, [segments]);
  if (audio && url)
    return (
      <audio
        controls
        preload="metadata"
        src={url}
        aria-label="Recorded answer"
        className="w-full"
      />
    );
  if (!url)
    return (
      <p className="notice">
        Private media is unavailable. Refresh its five-minute URL or check
        storage setup.
      </p>
    );
  return (
    <div>
      <video
        ref={ref}
        controls
        preload="metadata"
        className="capture-video"
        onLoadedMetadata={() => {
          if (ref.current) ref.current.currentTime = start / 1000;
        }}
        aria-label={audio ? "Recorded answer" : "Training recording"}
        src={url}
      >
        {captions && (
          <track
            kind="captions"
            src={captions}
            srcLang="en"
            label="Transcript"
            default
          />
        )}
      </video>
      {segments.map((s) => (
        <button
          key={s.id}
          type="button"
          className="secondary transcript-seek"
          data-current={highlight.includes(s.id)}
          onClick={() => {
            if (ref.current) ref.current.currentTime = (s.start_ms ?? 0) / 1000;
          }}
        >
          {((s.start_ms ?? 0) / 1000).toFixed(1)}s · {s.text_content}
        </button>
      ))}
    </div>
  );
}
export function SourcePlayer({
  sourceId,
  audio,
  start = 0,
}: {
  sourceId: string;
  audio: boolean;
  start?: number;
}) {
  const [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState("");
  async function load() {
    const response = await apiFetch("/api/sources/" + sourceId + "/media", {
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok) setUrl(data.url);
    else setError(data.message);
  }
  return (
    <section className="mt-6">
      <button className="secondary" onClick={load}>
        Open recording at source timestamp
      </button>
      {error && <p role="alert">{error}</p>}
      {url && <PrivatePlayer url={url} audio={audio} start={start} />}
    </section>
  );
}
