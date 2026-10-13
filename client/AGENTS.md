# Alvis implementation instructions
Read ../alvis-blueprint/product-specification.md, ../alvis-blueprint/schemas and ../alvis-blueprint/prompts before editing. This directory implements Weeks 1–4. Public signup creates no existing-organization access; membership requires an atomic new-organization transaction or an authorized email-bound invitation.
Implement one approved milestone at a time. Use TypeScript strict mode. Keep OpenAI API and service role keys on the server. All private queries must enforce organization membership; never trust organization IDs from request bodies. Worker retrieval must require approved current revisions and index_ready. Model calls cannot approve, publish, change roles or invent source IDs. Approved content is immutable; corrections create a new revision. Use reviewed procedural steps directly for Guide mode. All fixture data is synthetic and must be labeled. A passed quiz is an assessment result, not certification.
When the app is scaffolded, provide lint, typecheck, unit/integration tests and Playwright scripts. Run checks relevant to the milestone, then review changes and report limitations. Maintain a lockfile. Never commit credentials. Do not mark live API, storage, SQL or browser integration as tested without running it.
Supabase grants explicit default EXECUTE privileges. Revoke PUBLIC, anon, authenticated and service_role before granting each RPC only to its intended role. Worker claim/finish/lease RPCs are service-only; models cannot call publication or membership RPCs. Every new function must pass the ACL regression test.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
