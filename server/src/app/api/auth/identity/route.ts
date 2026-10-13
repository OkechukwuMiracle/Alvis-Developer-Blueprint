import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, configured } from "@/database/supabase";
import { canRecover } from "@/services/auth-flow";
import { workspaces } from "@/database/workspaces";
import { DatabaseSetupError } from "@/database/errors";
export async function GET() {
  try {
  const jar = await cookies();
  const result = { configured: configured(), user: null as unknown, member: null as unknown, org: null as unknown, remembered: jar.has("alvis-invitation"), canRecover: false };
  if (!result.configured) return NextResponse.json(result);
  const client = await db();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json(result);
  result.user = { id: user.id, email: user.email, email_confirmed_at: user.email_confirmed_at, user_metadata: { full_name: String(user.user_metadata.full_name || "") } };
  result.canRecover = await canRecover(user.id);
  const selected = jar.get("alvis-organization")?.value;
  const { member, personal, organizations } = await workspaces(client, user.id, selected);
  if (member) {
    result.member = { organization_id: member.organization_id, role: member.role, display_name: member.display_name };
    const { data } = await client.from("organizations").select("name,demo_only").eq("id", member.organization_id).single();
    result.org = data;
  }
  return NextResponse.json({ ...result, active_context: member?.organizations.scope_kind || null,
    personal: personal ? { role: personal.role, display_name: personal.display_name } : null,
    workspaces: organizations.map(m => ({ id: m.organization_id, name: m.organizations.name, role: m.role })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ code: error instanceof DatabaseSetupError ? "DATABASE_SETUP_REQUIRED" : "SERVICE_UNAVAILABLE", message: error instanceof DatabaseSetupError ? error.message : "Account service unavailable. Try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
