"use client";
import { apiFetch } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import { MAX_VIDEO_BYTES, MAX_AUDIO_BYTES } from "@/lib/capture-contract";
export function MediaInput({
  audio = false,
  onFile,
}: {
  audio?: boolean;
  onFile: (file: File) => void;
}) {
  const [recording, setRecording] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    preview = useRef<HTMLVideoElement | null>(null);
  function cleanup() {
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearTimeout(timer.current);
  }
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanup();
    },
    [],
  );
  function choose(file: File) {
    setName(file.name);
    onFile(file);
  }
  async function start() {
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: !audio,
      });
      stream.current = media;
      const type = [
        audio ? "audio/webm;codecs=opus" : "video/webm;codecs=vp9,opus",
        audio ? "audio/mp4" : "video/mp4",
        audio ? "audio/webm" : "video/webm",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type) {
        cleanup();
        throw new Error("Unsupported recording format");
      }
      const r = new MediaRecorder(media, { mimeType: type });
      recorder.current = r;
      if (preview.current) preview.current.srcObject = media;
      const chunks: Blob[] = [];
      let bytes = 0;
      r.ondataavailable = (e) => {
        chunks.push(e.data);
        bytes += e.data.size;
        if (
          bytes > (audio ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES) &&
          r.state === "recording"
        )
          r.stop();
      };
      r.onstop = () => {
        cleanup();
        setRecording(false);
        if (bytes > (audio ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES)) {
          setError("Recording exceeds the size limit. Record a shorter clip.");
          return;
        }
        choose(
          new File(
            chunks,
            "recording." + (type.includes("mp4") ? "mp4" : "webm"),
            { type: type.split(";")[0] },
          ),
        );
      };
      r.start(1000);
      setRecording(true);
      timer.current = setTimeout(
        () => {
          if (r.state === "recording") r.stop();
        },
        audio ? 60000 : 180000,
      );
    } catch {
      cleanup();
      setError(
        "Camera or microphone unavailable. Choose an MP4/WebM file instead.",
      );
    }
  }
  return (
    <section>
      <label htmlFor={audio ? "audio-file" : "video-file"}>
        {audio
          ? "Upload recorded answer (up to 60 seconds, 10 MB)"
          : "Upload video (MP4/WebM, up to 180 seconds, 100 MB)"}
      </label>
      <input
        id={audio ? "audio-file" : "video-file"}
        type="file"
        accept={
          audio
            ? "audio/webm,audio/mp4,.webm,.m4a"
            : "video/mp4,video/webm,.mp4,.webm"
        }
        disabled={recording}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) choose(f);
        }}
      />
      {!audio && (
        <video
          ref={preview}
          muted
          autoPlay
          playsInline
          className={recording ? "capture-video" : "hidden"}
          aria-label="Local recording preview"
        />
      )}
      <button
        type="button"
        className="secondary mt-3"
        onClick={() => (recording ? recorder.current?.stop() : start())}
      >
        {recording
          ? "Stop recording"
          : audio
            ? "Record audio answer"
            : "Record video"}
      </button>
      {recording && (
        <p role="status">
          Recording · automatically stops at {audio ? 60 : 180} seconds.
        </p>
      )}
      {name && <p>Selected: {name}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export async function sendUpload(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type.split(";")[0]);
    xhr.timeout = 240000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error("Private upload failed. Retry using the same capture."),
          );
    xhr.onerror = () =>
      reject(new Error("Upload interrupted. Retry using the same capture."));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Retry using the same capture."));
    xhr.send(file);
  });
}
export async function checksum(file: File) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function post(url: string, body: unknown, key?: string) {
  const response = await apiFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Request failed.");
  return data;
}
