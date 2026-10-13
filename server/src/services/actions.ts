"use server";
import { db, context, configured } from "@/database/supabase";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contentErrors, safeNext } from "@/validation/content";
export async function signIn(form: FormData) {
  if (!configured()) redirect("/login?setup=1");
  const client = await db();
  const { error } = await client.auth.signInWithPassword({
    email: String(form.get("email")),
    password: String(form.get("password")),
  });
  const next = safeNext(String(form.get("next") ?? "/home"));
  if (error)
    redirect("/login?error=credentials&next=" + encodeURIComponent(next));
  redirect(next);
}
export async function signOut() {
  const client = await db();
  await client.auth.signOut();
  redirect("/login");
}
export async function mutate(form: FormData) {
  const id = String(form.get("revision_id"));
  const path = "/review/" + id;
  const { supabase, member, user } = await context(path);
  const operation = String(form.get("operation"));
  const target = member.role === "expert" ? "/drafts/" + id : path;
  const { data: revision } = await supabase
    .from("knowledge_revisions")
    .select("created_by")
    .eq("organization_id", member.organization_id)
    .eq("id", id)
    .single();
  if (!revision) redirect("/home");
  if (
    ["save", "submit"].includes(operation)
      ? member.role !== "expert" || revision.created_by !== user.id
      : member.role !== "reviewer" || revision.created_by === user.id
  )
    redirect("/home");
  let content: unknown = null;
  if (operation === "save") {
    if (member.role !== "expert") redirect("/home");
    try {
      content = JSON.parse(String(form.get("content")));
    } catch {
      redirect(
        "/drafts/" + id + "?error=" + encodeURIComponent("Invalid JSON."),
      );
    }
    const { data: links } = await supabase
      .from("revision_sources")
      .select("source_id")
      .eq("organization_id", member.organization_id)
      .eq("revision_id", id);
    const errors = contentErrors(
      content,
      (links ?? []).map((x) => x.source_id),
    );
    if (errors.length)
      redirect(
        "/drafts/" + id + "?error=" + encodeURIComponent(errors.join(" ")),
      );
  }
  const { error } = await supabase.rpc("alvis_transition", {
    revision: id,
    operation,
    payload: content,
    expected_hash: String(form.get("hash")),
    comment: String(form.get("comment") ?? ""),
    request_key: String(form.get("request_key") ?? ""),
  });
  if (error)
    redirect(
      target +
        "?error=" +
        encodeURIComponent(
          error.message.startsWith("ALVIS:")
            ? error.message.slice(6)
            : "The change could not be saved. Refresh and try again.",
        ),
    );
  revalidatePath("/home");
  revalidatePath("/knowledge");
  revalidatePath("/review");
  revalidatePath("/drafts");
  redirect(target + "?saved=1");
}
export async function copyDraft(form: FormData) {
  const { supabase, member } = await context("/drafts");
  if (member.role !== "expert") redirect("/home");
  const id = String(form.get("unit_id"));
  const { data: unit } = await supabase
    .from("knowledge_units")
    .select("id")
    .eq("organization_id", member.organization_id)
    .eq("id", id)
    .single();
  if (!unit) redirect("/home");
  const { data, error } = await supabase.rpc("alvis_copy_draft", { unit: id });
  if (error)
    redirect(
      "/drafts?error=" +
        encodeURIComponent(
          error.message.startsWith("ALVIS:")
            ? error.message.slice(6)
            : "Draft could not be created. Refresh and try again.",
        ),
    );
  redirect("/drafts/" + data);
}
