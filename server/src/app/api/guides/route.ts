import { NextRequest } from "next/server";
import { learningRpc, jsonBody } from "@/services/learning-api";
export async function POST(request: NextRequest) {
  const b = await jsonBody(request);
  return learningRpc(
    request,
    "guide_start",
    b?.revision_id ?? null,
    b ?? {},
    true,
  );
}
