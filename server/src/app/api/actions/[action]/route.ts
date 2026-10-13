import { NextRequest, NextResponse } from "next/server";
import * as authentication from "@/services/account-actions";
import * as knowledge from "@/services/actions";
import { sameOrigin, failure } from "@/middleware/api";
import { navigationResult } from "@/middleware/navigation";
const actions = { ...authentication, ...knowledge };
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return failure("Approved frontend origin required.", 403);
  const action = (await params).action;
  if (!Object.hasOwn(actions, action)) return failure("Unavailable.", 404);
  try {
    const input = await request.json();
    const form = new FormData();
    for (const [key, value] of Object.entries(input)) if (typeof value === "string") form.set(key, value);
    await actions[action as keyof typeof actions](form);
    return NextResponse.json({ next: "/home" });
  } catch (error) { return navigationResult(error); }
}
