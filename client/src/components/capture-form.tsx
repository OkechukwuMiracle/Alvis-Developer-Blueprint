"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MediaInput, checksum, sendUpload, post } from "./media-input";
import { uploadErrors, CONSENT_VERSION } from "@/lib/capture-contract";
export function CaptureForm({
  assets,
  workspaceKey,
  personal = false,
}: {
  assets: { id: string; code: string; name: string }[];
  workspaceKey: string;
  personal?: boolean;
}) {
  const router = useRouter();
  const uploadKey = "alvis-upload:" + workspaceKey;
  const captureKey = "alvis-capture-request:" + workspaceKey;
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!file) return setError("Record or choose a video.");
    const mime = file.type.split(";")[0];
    if (uploadErrors(mime, file.size).length)
      return setError("Choose an MP4/WebM recording up to 100 MB.");
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const hash = await checksum(file),
        saved = sessionStorage.getItem(uploadKey);
      const remembered = sessionStorage.getItem(captureKey);
      const previous = remembered ? JSON.parse(remembered) : null;
      const requestId =
        previous?.checksum === hash ? previous.request_id : crypto.randomUUID();
      // Save before the request: a lost create response can be retried without another capture.
      sessionStorage.setItem(
        captureKey,
        JSON.stringify({ request_id: requestId, checksum: hash }),
      );
      let captureId: string | undefined = saved
        ? JSON.parse(saved).capture_id
        : undefined;
      if (saved && JSON.parse(saved).checksum !== hash)
        throw new Error(
          "A different upload is unfinished. Open Home to resume or clear this capture and start again.",
        );
      let upload;
      if (captureId)
        upload = await post("/api/captures/" + captureId + "/upload", {
          mime,
          bytes: file.size,
        });
      else {
        upload = await post("/api/captures", {
          title: form.get("title"),
          task: personal ? `Subject / tools: ${String(form.get("subject") || "")}\n${String(form.get("task") || "")}` : form.get("task"),
          asset_id: form.get("asset_id"),
          consent: true,
          consent_version: CONSENT_VERSION,
          mime,
          bytes: file.size,
          request_id: requestId,
          checksum: hash,
        });
        captureId = upload.capture_id;
        sessionStorage.setItem(
          uploadKey,
          JSON.stringify({ capture_id: captureId, checksum: hash }),
        );
      }
      await sendUpload(upload.url, file, setProgress);
      await post(
        "/api/captures/" + captureId + "/complete",
        { upload_id: upload.upload_id, checksum: hash },
        crypto.randomUUID(),
      );
      sessionStorage.removeItem(uploadKey);
      sessionStorage.removeItem(captureKey);
      router.push("/captures/" + captureId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card stack">
      <label htmlFor="capture-title">Capture title</label>
      <input
        id="capture-title"
        name="title"
        maxLength={200}
        required
        disabled={busy}
      />
      {personal && <><label htmlFor="capture-subject">Subject, tools or equipment</label><input id="capture-subject" name="subject" required maxLength={200} disabled={busy} /><p>Private personal capture. No organization asset is required.</p></>}
      <label htmlFor="capture-asset">{personal ? "Personal recording context" : "Training asset"}</label>
      <select id="capture-asset" name="asset_id" required disabled={busy}>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} · {a.name}
          </option>
        ))}
      </select>
      <label htmlFor="capture-task">Describe the task</label>
      <textarea
        id="capture-task"
        name="task"
        maxLength={2000}
        required
        disabled={busy}
      />
      <MediaInput onFile={setFile} />
      <label className="checkbox-label">
        <input type="checkbox" name="consent" required disabled={busy} /> I am
        authorized to record and share this task. Contributors consent to this
        recording under policy recording-v1.
      </label>
      <p className="notice">
        Record a supervised training simulation. Avoid recording people or
        confidential material. A 45–90 second recording is preferred.
      </p>
      {busy && (
        <p role="status">
          Uploading {progress}% · media is validated by the worker before
          transcription.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button disabled={busy || !assets.length}>
          {busy ? "Uploading…" : "Upload and process"}
        </button>
        <Link href="/home">Cancel</Link>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            sessionStorage.removeItem(uploadKey);
            sessionStorage.removeItem(captureKey);
            setError(
              "Upload retry cleared. Existing capture remains available from Home.",
            );
          }}
        >
          Clear upload retry
        </button>
      </div>
    </form>
  );
}
