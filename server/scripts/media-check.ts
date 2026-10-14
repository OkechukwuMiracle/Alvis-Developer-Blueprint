// Uses generated test media only; does not upload, transcribe, or claim expert consent.
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { command, prepareMedia } from "../src/jobs/media";

const directory = await mkdtemp(join(tmpdir(), "alvis-media-check-"));
try {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  for (const [name, binary] of [["FFmpeg", ffmpeg], ["ffprobe", ffprobe]]) {
    const version = await command(binary, ["-version"], 10000);
    console.log(`${name}: ${version.split(/\r?\n/)[0]}`);
  }
  const input = join(directory, "synthetic.mp4");
  const output = join(directory, "audio.wav");
  await command(ffmpeg, ["-nostdin", "-v", "error", "-f", "lavfi", "-i",
    "color=c=black:s=160x120:r=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
    "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-y", input]);
  const bytes = await readFile(input);
  const result = await prepareMedia(input, output, "video/mp4", bytes.length,
    createHash("sha256").update(bytes).digest("hex"));
  if (result.audio_seconds < 1.9 || result.audio_seconds > 2.2 || !(await stat(output)).size)
    throw new Error("Unexpected decoded audio duration or empty output.");
  console.log(`PASSED real probe, video decoding, checksum validation and WAV extraction: ${result.audio_seconds.toFixed(3)} seconds.`);
  const webm = join(directory, "headerless.webm");
  await command(ffmpeg, ["-nostdin", "-v", "error", "-f", "lavfi", "-i",
    "color=c=black:s=160x120:r=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "2", "-c:v", "libvpx-vp9", "-c:a", "libopus", "-live", "1", "-y", webm]);
  const probe = JSON.parse(await command(ffprobe, ["-v", "error", "-show_format", "-of", "json", webm]));
  if (probe.format.duration !== undefined) throw new Error("Expected headerless WebM test input.");
  const webmBytes = await readFile(webm);
  const webmResult = await prepareMedia(webm, output, "video/webm", webmBytes.length,
    createHash("sha256").update(webmBytes).digest("hex"));
  if (webmResult.audio_seconds < 1.9 || webmResult.audio_seconds > 2.2)
    throw new Error("Unexpected headerless WebM audio duration.");
  console.log(`PASSED headerless WebM packet timing and decoded audio: ${webmResult.audio_seconds.toFixed(3)} seconds.`);
  console.log("Synthetic media smoke test only; storage and live expert/model workflow are not tested.");
} catch {
  console.error("FAILED media check. Configure FFMPEG_PATH and FFPROBE_PATH as executable paths in server/.env.local, or install both on PATH.");
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
