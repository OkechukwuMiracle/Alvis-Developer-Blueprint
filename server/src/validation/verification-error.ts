export function verificationError(code?: string) {
  if (["bad_code_verifier", "validation_failed", "flow_state_not_found"].includes(code || ""))
    return "The signup browser verification could not be matched. Use the same browser and hostname used to sign up, or sign in if your email is already confirmed.";
  if (["otp_expired", "flow_state_expired"].includes(code || ""))
    return "This verification link has expired or was already consumed. Request a fresh email, or sign in if your email is already confirmed.";
  return "Email verification could not be completed. Try again; if the email is already confirmed, sign in. Otherwise request a fresh email.";
}
