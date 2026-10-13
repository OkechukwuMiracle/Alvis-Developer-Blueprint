import { spawn } from "node:child_process";
import { stat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  PipelineError,
  MAX_VIDEO_BYTES,
  MAX_AUDIO_BYTES,
} from "../validation/capture-contract";
export function command(
  binary: string,
  args: string[],
  timeout = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new PipelineError("MEDIA_TIMEOUT"));
    }, timeout);
    child.stdout.on("data", (x) => {
      out += x;
      if (out.length > 1000000) {
        child.kill();
        reject(new PipelineError("INVALID_MEDIA"));
      }
    });
    child.stderr.on("data", (x) => {
      err = (err + x).slice(-4000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new PipelineError("FFMPEG_UNAVAILABLE"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new PipelineError("INVALID_MEDIA"));
    });
  });
}
export type Probe = {
  format: { duration: string; start_time?: string; format_name: string };
  streams: { codec_type: string; codec_name: string; start_time?: string }[];
};
export function validateProbe(p: Probe, mime: string, audio = false) {
  const duration = Number(p.format?.duration);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > (audio ? 60 : 180)
  )
    throw new PipelineError("INVALID_DURATION");
  const container = p.format.format_name.split(",");
  if (
    mime.endsWith("mp4")
      ? !container.includes("mp4")
      : !container.includes("webm")
  )
    throw new PipelineError("INVALID_FORMAT");
  const video = p.streams.filter((s) => s.codec_type === "video"),
    sound = p.streams.filter((s) => s.codec_type === "audio");
  if (
    !sound.length ||
    (!audio && !video.length) ||
    (audio && video.length) ||
    video.some(
      (s) => !["h264", "hevc", "vp8", "vp9", "av1"].includes(s.codec_name),
    ) ||
    sound.some((s) => !["aac", "opus", "vorbis", "mp3"].includes(s.codec_name))
  )
    throw new PipelineError("INVALID_CODEC");
  return duration;
}
export async function prepareMedia(
  input: string,
  output: string,
  mime: string,
  expectedBytes: number,
  checksum: string,
  audio = false,
) {
  const bytes = (await stat(input)).size;
  if (
    bytes !== expectedBytes ||
    bytes < 1 ||
    bytes > (audio ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES)
  )
    throw new PipelineError("INVALID_SIZE");
  const hash = createHash("sha256")
    .update(await readFile(input))
    .digest("hex");
  if (hash !== checksum) throw new PipelineError("CHECKSUM_MISMATCH");
  const probe = JSON.parse(
    await command(process.env.FFPROBE_PATH || "ffprobe", [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      input,
    ]),
  ) as Probe;
  const duration = validateProbe(probe, mime, audio);
  if (!audio) {
    const progress = await command(process.env.FFMPEG_PATH || "ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-v",
      "error",
      "-xerror",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-an",
      "-progress",
      "pipe:1",
      "-nostats",
      "-f",
      "null",
      "-",
    ]);
    const times = [...progress.matchAll(/out_time_us=(\d+)/g)].map(
      (x) => Number(x[1]) / 1000000,
    );
    if (times.some((t) => t > 180)) throw new PipelineError("INVALID_DURATION");
  }
  await command(process.env.FFMPEG_PATH || "ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-v",
    "error",
    "-xerror",
    "-protocol_whitelist",
    "file,pipe",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-y",
    output,
  ]);
  const decoded = JSON.parse(
    await command(process.env.FFPROBE_PATH || "ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-of",
      "json",
      output,
    ]),
  );
  if (
    !Number.isFinite(Number(decoded.format.duration)) ||
    Number(decoded.format.duration) <= 0 ||
    Number(decoded.format.duration) > (audio ? 60 : 180)
  )
    throw new PipelineError("INVALID_DURATION");
  if ((await stat(output)).size > 24000000)
    throw new PipelineError("INVALID_SIZE");
  const audioOffset = Math.max(
    0,
    Number(
      probe.streams.find((s) => s.codec_type === "audio")?.start_time || 0,
    ) - Number(probe.format.start_time || 0),
  );
  if (!Number.isFinite(audioOffset) || audioOffset > duration)
    throw new PipelineError("INVALID_TIMESTAMPS");
  return {
    bytes,
    checksum: hash,
    duration,
    audio_seconds: Number(decoded.format.duration),
    audio_offset_ms: Math.round(audioOffset * 1000),
  };
}
