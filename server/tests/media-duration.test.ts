import test from "node:test";
import assert from "node:assert/strict";
import { packetDuration, validateProbe } from "../src/jobs/media";

test("headerless WebM duration comes from actual packet endpoints and stream start", () => {
  assert.ok(Math.abs(packetDuration("1.000,0.020\nN/A,N/A\n3.000,0.020\n", 1) - 2.02) < 0.000001);
  assert.throws(() => packetDuration("N/A,N/A\n"));
  assert.throws(() => packetDuration(""));
});
test("packet-derived WebM duration retains recording and audio limits", () => {
  const probe = (seconds: number) => ({ format: { duration: String(seconds), format_name: "matroska,webm" },
    streams: [{codec_type: "video", codec_name: "vp9"}, {codec_type: "audio", codec_name: "opus"}] });
  assert.equal(validateProbe(probe(packetDuration("179.98,0.02")), "video/webm"), 180);
  assert.throws(() => validateProbe(probe(packetDuration("180.00,0.02")), "video/webm"));
  assert.throws(() => validateProbe({ ...probe(61), streams: [{codec_type: "audio", codec_name: "opus"}] }, "audio/webm", true));
});
