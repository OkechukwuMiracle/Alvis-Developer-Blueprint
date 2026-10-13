import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export const mediaBucket =
  process.env.ALVIS_STORAGE_BUCKET || "alvis-recordings";
export function admin() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server storage configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function s3() {
  const endpoint = process.env.SUPABASE_S3_ENDPOINT,
    region = process.env.SUPABASE_S3_REGION,
    accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID,
    secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey)
    throw new Error("Private upload S3 configuration is missing.");
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}
export async function uploadUrl(upload: {
  storage_key: string;
  mime: string;
  expected_bytes: number;
  expires_at: string;
}) {
  const seconds = Math.min(
    300,
    Math.floor((Date.parse(upload.expires_at) - Date.now()) / 1000),
  );
  if (seconds < 1) throw new Error("Upload expired.");
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: mediaBucket,
      Key: upload.storage_key,
      ContentType: upload.mime,
      ContentLength: Number(upload.expected_bytes),
    }),
    { expiresIn: seconds },
  );
}
export async function checkUpload(upload: {
  storage_key: string;
  expected_bytes: number;
  mime: string;
}) {
  const object = await s3().send(
    new HeadObjectCommand({ Bucket: mediaBucket, Key: upload.storage_key }),
  );
  if (
    object.ContentLength !== Number(upload.expected_bytes) ||
    object.ContentType?.split(";")[0] !== upload.mime
  )
    throw new Error("Uploaded object type or size does not match.");
}
export async function downloadUrl(key: string) {
  const { data, error } = await admin()
    .storage.from(mediaBucket)
    .createSignedUrl(key, 300);
  if (error || !data) throw new Error("Private media unavailable.");
  return data.signedUrl;
}
