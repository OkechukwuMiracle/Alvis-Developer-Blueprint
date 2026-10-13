import { NextRequest } from "next/server";
import { learningRpc, jsonBody } from "@/services/learning-api";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return learningRpc(
    request,
    "guide_advance",
    (await params).id,
    await jsonBody(request),
    true,
  );
}
