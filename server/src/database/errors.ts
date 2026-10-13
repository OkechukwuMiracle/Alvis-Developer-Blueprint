export class DatabaseSetupError extends Error {
  constructor() {
    super("Database setup is incomplete. Apply the Alvis migrations to the Supabase project configured in server/.env.local.");
    this.name = "DatabaseSetupError";
  }
}

export function checkDatabaseError(error: { code?: string } | null) {
  if (error && ["PGRST205", "PGRST204", "42P01", "42703", "42883", "PGRST202"].includes(error.code || ""))
    throw new DatabaseSetupError();
}
