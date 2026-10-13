export function invitationError(error: { code?: string; message?: string }) {
  if (error.code === "P0001" && error.message === "Verified email required")
    return { status: 403, message: "Verify the invited email address before accepting this invitation." };
  if (error.code === "P0001" && error.message === "Name required")
    return { status: 400, message: "Enter your full name using 2–100 characters." };
  if (error.code === "23505")
    return { status: 409, message: "An invitation is already pending. Use Resend on the existing invitation to issue a fresh link." };
  if (error.code === "P0001" && error.message === "Already a member")
    return { status: 409, message: "This person is already a member of the workspace." };
  if (error.code === "P0001" && error.message === "Invitation unavailable")
    return { status: 409, message: "Sign in with the exact verified email that received this invitation. If it still fails, the link may have been replaced, expired, revoked, or used by another account; ask the administrator to resend it." };
  return { status: 503, message: "The invitation service is unavailable. Ask the administrator to check database migrations and function permissions." };
}
