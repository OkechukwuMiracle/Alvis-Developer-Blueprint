export function signupErrorReason(error: { code?: string; status?: number } | null | undefined) {
  const code = error?.code;
  if (code === "over_email_send_rate_limit") return "email_rate_limit";
  if (error?.status === 429 || code === "over_request_rate_limit") return "rate_limit";
  if (code === "email_address_not_authorized") return "email_delivery";
  if (code === "signup_disabled" || code === "email_provider_disabled") return "signup_disabled";
  if (code === "weak_password") return "password_policy";
  if (code === "email_address_invalid" || code === "validation_failed") return "validation";
  if (code === "captcha_failed") return "captcha";
  return "unavailable";
}

export const signupErrorMessages: Record<string, string> = {
  validation: "Enter a valid email and name, and matching passwords of 12–128 characters.",
  password_policy: "Your password does not meet this service’s requirements. Use a stronger password with uppercase and lowercase letters, numbers, and symbols.",
  email_rate_limit: "Verification email sending is temporarily rate limited. Wait before retrying; repeated attempts will not help. Existing users can sign in. The administrator should check Supabase Auth email limits and SMTP setup.",
  rate_limit: "Registration requests are temporarily rate limited. Wait before retrying; existing users can sign in. The administrator should check Supabase Auth rate limits.",
  email_delivery: "Verification emails cannot currently be sent to this address. The administrator must configure Supabase Auth email delivery before public signup can work.",
  signup_disabled: "New registrations are disabled by the authentication service. Contact your administrator or sign in with an existing account.",
  captcha: "Registration requires an anti-abuse check that is not available. Contact your administrator.",
  configuration: "Registration is not configured. Contact your administrator.",
  unavailable: "Registration is temporarily unavailable. Try again later; existing users can sign in or recover their password.",
};
