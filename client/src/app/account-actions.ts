"use server";
import { redirect } from "next/navigation";
import { action } from "@/lib/api-server";
export async function signup(form: FormData) { redirect(await action("signup", form)); }
export async function resendVerification(form: FormData) { redirect(await action("resendVerification", form)); }
export async function forgotPassword(form: FormData) { redirect(await action("forgotPassword", form)); }
export async function resetPassword(form: FormData) { redirect(await action("resetPassword", form)); }
export async function createOrganization(form: FormData) { redirect(await action("createOrganization", form)); }
export async function switchOrganization(form: FormData) { redirect(await action("switchOrganization", form)); }
export async function activatePersonal(form: FormData) { redirect(await action("activatePersonal", form)); }
