export function personalSignup(metadata: Record<string, unknown>): boolean {
  return metadata.account_kind === "personal" && metadata.signup_destination !== "/invite";
}
export function communitySignupRole(value: unknown): "expert" | "reviewer" | "worker" {
  return value === "expert" || value === "reviewer" ? value : "worker";
}
