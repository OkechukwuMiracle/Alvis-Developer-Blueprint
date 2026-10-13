export const INVITE_ROLES = ["expert", "reviewer", "worker"] as const;
export function emailAddress(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}
export function passwordError(password: string, confirmation: string) {
  if (password.length < 12 || password.length > 128)
    return "Use a password between 12 and 128 characters.";
  if (password !== confirmation) return "Passwords must match.";
  return null;
}
export function validInvitationToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
