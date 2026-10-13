import { NextRequest } from "next/server";
import { transition } from "@/services/transition-api";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ revisionId: string }> },
) {
  return transition(request, (await params).revisionId, "submit");
}
