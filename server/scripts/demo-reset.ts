import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
const org = process.env.ALVIS_DEMO_ORGANIZATION_ID;
const environment = process.env.ALVIS_DEPLOYMENT_ENV;
if (
  !org ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    org,
  ) ||
  !["development", "staging"].includes(environment || "")
)
  throw new Error(
    "Set the designated demo UUID and a nonproduction ALVIS_DEPLOYMENT_ENV.",
  );
const file = process.env.ALVIS_E2E_ACCOUNTS_FILE;
if (!file)
  throw new Error(
    "Provide an external accounts file containing the actual registered demo administrator.",
  );
const accounts = JSON.parse(await readFile(file, "utf8"));
if (!accounts.admin?.email || !accounts.admin?.password)
  throw new Error(
    "Registered administrator account required; never use a public demo role switcher.",
  );
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);
const { error: login } = await client.auth.signInWithPassword(accounts.admin);
if (login) throw new Error("Administrator sign-in failed.");
const { data, error } = await client
  .from("organizations")
  .select("id,name,demo_only")
  .eq("id", org)
  .single();
if (error || !data?.demo_only)
  throw new Error(
    "Designated demo workspace unavailable or not explicitly flagged demo_only.",
  );
if (!process.argv.includes("--execute")) {
  console.log(
    "Dry run: only designated demo workspace knowledge, captures, jobs and pending invitations will be invalidated. Accounts, assets, assessment history and audit remain.",
  );
} else {
  const confirm = process.argv[process.argv.indexOf("--confirm") + 1];
  if (confirm !== org)
    throw new Error("Pass --confirm with the exact configured demo UUID.");
  const { error } = await client.rpc("alvis_demo_reset", {
    org,
    confirmation: confirm,
  });
  if (error)
    throw new Error(
      "Demo reset failed; check administrator membership and workspace designation.",
    );
  console.log(
    "Designated demo reset completed. Prepare fresh recordings and separately reviewed lessons before rehearsal.",
  );
}
await client.auth.signOut();
