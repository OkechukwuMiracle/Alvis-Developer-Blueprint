import { NextRequest } from "next/server";
import { learningRpc } from "@/services/learning-api";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return learningRpc(request, "lesson_get", (await params).id);
}
