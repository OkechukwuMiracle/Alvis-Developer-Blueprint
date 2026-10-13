"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/api-server";
export async function signIn(form: FormData) { redirect(await action("signIn", form)); }
export async function signOut() { redirect(await action("signOut", new FormData())); }
export async function mutate(form: FormData) {
  const next = await action("mutate", form);
  for (const path of ["/home", "/knowledge", "/review", "/drafts"]) revalidatePath(path);
  redirect(next);
}
export async function copyDraft(form: FormData) { redirect(await action("copyDraft", form)); }
