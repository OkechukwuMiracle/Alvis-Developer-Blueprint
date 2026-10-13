# Alvis · Weeks 1–4

Next.js, TypeScript, Tailwind and Supabase. The preserved blueprint is in ../alvis-blueprint. Week 1 supplies sign-in, role-based Home, review and publication. Week 2 adds capture, transcript review, expert debrief and structured draft editing. Week 3 adds approved hybrid retrieval, Ask, reviewed guides, reviewer-approved lessons and assessment history. New industries, certification, risk scores and equipment control remain outside scope.

## Local development

Requires Node.js 22+ and npm. In this application directory:

```powershell
npm ci
# Only when .env.local does not already exist:
Copy-Item .env.example .env.local
# Configure the variables described below.
npm run dev
```

Open **http://127.0.0.1:3000/** for the public site, `/signup` to register or `/login` to sign in. Start the worker in a separate terminal with `npm run worker`; `npm run worker:once` handles one available job. Start approved indexing/lesson processing with `npm run worker:learning`. Without configuration, authentication or capture reports setup requirements. No mocked authentication or processing replaces missing services.

Install FFmpeg and ffprobe, verify `ffmpeg -version` and `ffprobe -version`, and put both on PATH or set their absolute executable paths below. The worker needs a writable temporary directory and space for the uploaded recording and decoded audio. One worker processes one job at a time; additional processes use database leases to share work.

## Supabase and server configuration

Use a disposable development Supabase project. Apply every SQL file in supabase/migrations in filename order: foundation, review workflow, capture pipeline, private storage, then draft history and retrieval/learning. Existing Week 1 projects need the four later migrations beginning 202610080003. The retrieval/learning migration requires pgvector and queues existing approved revisions for real embeddings. Do not apply supabase/deferred/embedding.sql separately. The private-storage migration requires Supabase's existing storage schema; the test harness is **not** a production migration.

Enable public email/password Auth signups **and Confirm Email**. Set Site URL to your exact `ALVIS_SITE_URL` and allow `/auth/confirm` and `/auth/callback` at that origin in Supabase Auth redirect settings. Apply all migrations, including 007 onboarding, 008 evidence withdrawal and 009 scoped demo reset and 010 explicit function permissions and 011 capture-creation idempotency and 012 the read-only permission preflight. The private alvis-recordings bucket is created by migration; ensure your project upload limit permits 100 MB. Obtain dedicated S3 credentials and endpoint/region from Supabase Storage. Keep them on the server. S3 setup follows [Supabase's official documentation](https://supabase.com/docs/guides/storage/s3/authentication).

| Variable                             | Purpose                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Project API URL                                                         |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public publishable or legacy anon key                                   |
| SUPABASE_SERVICE_ROLE_KEY            | Server capture/storage operations, worker and seed adapter              |
| SUPABASE_S3_ENDPOINT                 | Project S3 endpoint from Storage settings                               |
| SUPABASE_S3_REGION                   | Region from Storage settings                                            |
| SUPABASE_S3_ACCESS_KEY_ID            | Dedicated server S3 access key                                          |
| SUPABASE_S3_SECRET_ACCESS_KEY        | Dedicated server S3 secret                                              |
| ALVIS_STORAGE_BUCKET                 | alvis-recordings                                                        |
| OPENAI_API_KEY                       | Server-side OpenAI API credential                                       |
| OPENAI_MODEL_TEXT                    | Your explicitly selected model supporting strict Structured Outputs     |
| OPENAI_MODEL_STT                     | whisper-1, required for timestamped verbose JSON in this implementation |
| FFMPEG_PATH / FFPROBE_PATH           | Optional absolute executable paths; otherwise PATH                      |
| ALVIS_SEED_ACCOUNTS_FILE             | External seed account JSON path                                         |
| ALVIS_E2E_ACCOUNTS_FILE              | External browser/Auth test account JSON path                            |
| ALVIS_LIVE_RECORDING                 | Absolute path to an actual MP4/WebM training video                      |
| ALVIS_LIVE_DEBRIEF_FILE              | External JSON containing expert-authored answers by target_field        |

.env files are ignored except .env.example. Never put credentials in source or public environment variables. The service key bypasses RLS, so its use is limited to server operations after authenticated organization and ownership checks, and to the trusted worker. Browser draft/review operations retain authenticated database checks.

Create account JSON **outside the repository**, with expert, reviewer, worker and admin objects, each containing email and a unique password of at least 12 characters. Set ALVIS_SEED_ACCOUNTS_FILE and run `npm run seed`. The adapter creates real Auth accounts and imports fictional manufacturing fixtures into a demo_only tenant; it refuses to overwrite an existing fixture organization. Partial seed failures require cleaning the disposable project and partially created development accounts before retrying. Fixtures contain no real recordings and simulated approvals are limited to this tenant.

## Capture through publication

1. Sign in as an expert, choose Record knowledge, select an asset, describe the task and grant recording consent. Record with camera/microphone or upload MP4/WebM, at most 100 MB and 180 seconds.
2. The browser uploads directly to private storage using a five-minute authorized URL. Completion checks stored type/size and an idempotency key. The worker independently checks checksum, container, codecs, decoded duration and audio before archiving a verified recording and transcribing it.
3. Open Processing to inspect durable stage status and timestamped transcript segments. Clicking evidence opens its recording position. Correcting text creates new evidence with the original timestamps and preserves earlier evidence.
4. Extraction validates the supplied Knowledge Unit schema and references to actual evidence from this capture and organization. Unknown judgment remains visible as gaps. Debrief asks at most five questions; answer by text or recorded audio, or mark cannot confirm. Saved answers become immutable sources. The final answer queues a new proposal automatically.
5. Inspect current and proposed draft content before accepting regeneration, or explicitly keep saved expert edits. Concurrent edits reject stale proposals. Use the structured editor to inspect claims, evidence, gaps and contradictions, then submit through the existing review workflow. Unanswered gaps still prevent submission where the existing completeness rules require confirmation.
6. A separate reviewer approves with a comment. Workers then read the current approved version and its cited sources. AI jobs cannot approve or publish. Approved corrections create a new revision; previous approved content remains immutable.

Captured sources and draft edit snapshots preserve history. Workers cannot browse captures, questions, draft snapshots or uncited historical sources. They may obtain a short-lived recording URL only through evidence cited by the active approved version. Capture ownership and organization membership are checked server-side and in SQL. Reviewers cannot approve their own drafts.

The worker uses two-minute fenced leases, heartbeats and at most three attempts. Recoverable failures back off with bounded delay; exhausted failures require an explicit eligible retry or a replacement recording. Duplicate completion creates one job. A restarted worker can recover expired leases. Status comes from PostgreSQL and survives browser refresh. Old-generation jobs cannot overwrite newer corrections.

Transcription uses [OpenAI timestamped speech-to-text](https://developers.openai.com/api/docs/guides/speech-to-text); extraction/debrief use the Responses API with [strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), store:false, refusal checks, schema validation and evidence checks. One validation repair is attempted before the stage fails. No prompt can grant publication privileges. ai_runs records provider request IDs, usage when returned, audio seconds and latency; it does not invent a monetary cost.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:ALVIS_BROWSER_CHANNEL='chrome' # Installed Chrome; alternatively install Playwright Chromium.
npm run test:e2e
```

Authenticated browser and Supabase REST tests require the external account file and real project configuration. They explicitly skip when unavailable. To load environment variables into the integration process: `npx tsx --env-file=.env.local --test tests/integration/*.test.ts`.

For SQL tests, create a disposable PostgreSQL 16 container with no published ports, apply tests/integration/bootstrap.sql and migrations 001–003. Apply tests/integration/storage-harness.sql **only to this test database**, then migrations 004–012. Set ALVIS_TEST_DB_CONTAINER to its container name and ALVIS_TEST_DB_NAME to the database name, then run `npm run test:integration`. The harness executes real PostgreSQL RLS and workflow transactions with a test auth.uid(); it does not verify Supabase Auth, signed URLs or the S3 service. Database roles are cluster-wide, so bootstrap should be applied once per fresh container.

For a live test, start the app and worker, provide ALVIS_LIVE_RECORDING, ALVIS_E2E_ACCOUNTS_FILE and ALVIS_LIVE_DEBRIEF_FILE, then run `npm run test:e2e:live`. The fixture tenant must be seeded with CV-07. The answers JSON maps generated target_field values to real expert-confirmed answers; inspect the actual questions first. Missing answers abort the test rather than inventing them. Use only an authorized training recording. The test logs time to first draft and total time to review submission; inspect ai_runs for provider usage. This test writes a real capture and submits a real draft in the disposable project.

Verification performed on 8 October 2026: unit tests and PostgreSQL workflow, capture authorization and storage-policy tests passed. Type checking, linting and production build were run. The worker failed before claiming jobs when configuration was absent; after OpenAI variables were supplied, startup failed with FFMPEG_UNAVAILABLE. Live OpenAI transcription, FFmpeg execution, S3 uploads and signed-in capture screens remain unverified: S3 settings, FFmpeg and external recording/accounts/answers remain missing. OpenAI variables are now present, but no model call has been made. There is no observed live processing time or cost to report. Ten anonymous browser checks passed across desktop and mobile (eight foundation checks and two capture-boundary checks). The first capture-boundary run exceeded 60 seconds; both passed on rerun with a 120-second budget. Four authenticated/live browser journeys and one real Supabase Auth test were explicitly skipped. Anonymous browser checks do not establish that the authenticated workflow works against Supabase.

## Troubleshooting

- Queued forever: run the worker with the same Supabase project and all required server variables; check its startup error and durable job status.
- Missing FFmpeg: install both executables, reopen the terminal after changing PATH, or set absolute paths. No job is claimed until startup prerequisites pass.
- Upload fails: check S3 endpoint/region/credentials, bucket migration, project size limits and browser network response. Expired URLs require a new upload authorization.
- Invalid media: use supported MP4/WebM with a real audio track within duration/size limits. Before transcription, a failed recording can be replaced. Content type alone is insufficient.
- Provider/schema/evidence failure: inspect the safe stage error. Unknown evidence IDs are rejected. Check model compatibility and API access; eligible retries remain bounded.
- Proposal is stale: refresh, save your current edits and regenerate from current sources. A proposal never silently replaces edits.
- Submit is blocked: resolve required judgment gaps, wait for outstanding processing, and accept the current proposal or explicitly keep saved edits. Cannot confirm remains visible and does not fabricate completeness.
- Supabase tables/RPCs missing: apply all five migrations; schema or service reachability checks alone do not prove the live pipeline.

Publication now waits for the Week 3 hybrid index. The legacy keyword table is retained for compatibility; it cannot bypass index readiness.

## Week 3: indexing and reviewed learning

Apply **202610080006_retrieval_learning.sql** after Week 2. It requires pgvector and queues existing approved revisions for real embeddings. Do not apply the deferred embedding file separately. New approvals are hidden from workers until all chunks commit. Retirement removes retrieval chunks, cancels indexing/lesson jobs and invalidates guides.

Keep your existing `OPENAI_MODEL_TEXT`. Add the separate server-only `OPENAI_MODEL_EMBED=text-embedding-3-small` setting. The implementation requests 1536 dimensions and checks provider output against the database `vector(1536)` column. A compatible third-generation model may be used at those dimensions. Changing embedding models requires rebuilding approved indexes; model spaces cannot be mixed. See [OpenAI's embedding documentation](https://developers.openai.com/api/docs/guides/embeddings).

Run the app and learning worker in separate terminals:

```powershell
npm run dev
npm run worker:learning
# One available indexing or lesson job:
npm run worker:learning:once
```

The learning worker needs no FFmpeg. Keep `npm run worker` running separately for captures. Both use durable fenced leases, heartbeats and at most three attempts. The revised seed adapter queues real indexing instead of setting keyword-only readiness.

Search filters organization, asset, approved state, active revision, completed indexing and embedding model before combining keyword and cosine ranks through reciprocal rank fusion (k=60). It returns at most five distinct revisions. No similarity percentage is displayed. Citation validation runs before display and SQL rechecks active revisions while locking publication pointers.

At `/ask`, select an asset and describe a supervised training problem. Responses support Answer, Clarify, Abstain and Escalate. Generated synthesis is labeled separately from reviewed sources. Source links open authorized excerpts or real recording timestamps. Hazard/bypass checks precede retrieval, and model instructions also enforce hazard escalation and conflict abstention. Identical reviewed contexts with different decisions are deterministically withheld; model instructions also require abstention for semantic conflicts. Applicable conflicts require reviewer reconciliation. Abstention offers an internal expert-review request; no email is sent. Citation integrity is not proof of semantic support.

From an applicable Knowledge Unit or Ask link, acknowledge simulation and reviewed prerequisites, then follow stored reviewed steps. Progress survives refresh. Every transition rechecks the pinned revision. Outcomes distinguish Completed in simulation, Not resolved and Stopped for help. Participation does not establish practical competence.

Reviewers draft lessons from indexed Knowledge Units and inspect them at `/review/lessons`. A lesson has a 130–195 word explanation (approximately 60–90 seconds at 130 words/minute) and exactly three distinct questions, each with four distinct choices and one correct answer. Check recognition, reasoning and exceptions/escalation against the evidence, then approve or reject with a comment. Rejected lessons can be drafted again. Eligible failed jobs offer bounded retries.

Workers access only separately approved lessons. Initial API and server-rendered payloads omit answer keys and question explanations. SQL grades responses, ignores client scores and deduplicates repeated submission keys. Retakes create new attempts. `/learning` shows lesson, revision/version, date and result, plus a suggestion sharing a skill with the latest assessment. Passing is **Knowledge check passed**. Reviewer summaries contain actual counts without employee rankings.

## Week 3 evaluation

Configure `ALVIS_E2E_ACCOUNTS_FILE` with your external seeded account JSON, the embedding setting, existing text model/API key and Supabase public settings. Apply all six migrations, seed a disposable project and complete real indexing first. Publish at least one reviewer-approved CV-07 lesson before the browser journey.

```powershell
npm run evaluate
# With app and learning worker running:
node --env-file=.env.local node_modules/@playwright/test/cli.js tests/e2e/learning.spec.ts
```

The evaluator runs the 15 supplied cases and records expected/actual modes, ranked revision IDs, relevant-case recall, forbidden exclusions, citation validity, source excerpts, latency and provider usage. Retrieval is evaluated separately from composition. Missing prerequisites produce **blocked** entries without fabricated answers. Reports are saved to `evaluation-results/week3.json` and ignored by Git because excerpts may be private.

A reviewer must annotate each factual claim's source support; `pending_human_review` is not a passing semantic-support result. Token usage is recorded where returned. No dollar cost is invented. A live model run on synthetic fixtures is a controlled synthetic-content evaluation, not evidence of industrial reliability.

The complete browser journey uses real worker authentication, asks a supported question, opens its source, completes a stored guide, submits the three-question assessment and checks learning history. It explicitly skips without real accounts and embedding configuration.

For database tests, use a fresh `pgvector/pgvector:pg16` container without published ports. Apply `bootstrap.sql` once, migrations 001–003, the test-only `storage-harness.sql`, then migrations 004–012. Set `ALVIS_TEST_DB_CONTAINER` and `ALVIS_TEST_DB_NAME` before `npm run test:integration`. SQL tests use labeled test vectors for authorization, ranking mechanics and state transitions; they are not model embeddings or a semantic retrieval benchmark. Earlier capture and review tests run against the same migration set and simulate index completion only inside the isolated SQL harness.

Observed verification on 8 October 2026: 19 unit tests and four PostgreSQL integration suites passed; the real Supabase Auth test was skipped. Type checking, linting and production build passed. Twelve anonymous desktop/mobile browser checks passed; two full learning journeys were skipped. Evaluation recorded **0 executed and 15 blocked cases** because the external worker-account path and embedding setting were absent. No live Ask/embedding/lesson latency or usage is available. Signed-in learning screens remain unverified against Supabase.

Troubleshooting: an empty worker library after migration usually means indexing has not finished. Check `/review/lessons` and the learning-worker terminal. A dimension mismatch must be fixed before indexing; fake vectors are never a fallback. Refresh and repeat a stale Ask request. Retirement blocks guides and lessons while preserving past assessment results. Apply all twelve migrations and configure actual accounts before claiming the authenticated flow works.

## Public accounts, organizations and invitations (Week 4)

Ordinary use does not require seeding. Visit `/signup`, enter name/email/matching 12–128 character passwords, and verify the email. `/onboarding` offers atomic creation of an empty organization or acceptance of an invitation. The creator is an administrator, not an implicit expert or reviewer. In `/settings`, add a training asset and invite distinct experts, reviewers and workers. Existing users can accept invitations using their existing verified account. Switch only between your authorized memberships using `/onboarding`.

Set `ALVIS_SITE_URL` to the exact origin (development: `http://127.0.0.1:3000`; staging: your HTTPS origin). Set `ALVIS_AUTH_FLOW_SECRET` to at least 32 random characters; for example generate it locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and store it only in your environment. Recovery fails closed without this setting. Add both `/auth/confirm` and `/auth/callback` origins to Supabase's redirect allowlist.

In Supabase Auth Email Templates, replace **Confirm signup** with `supabase/templates/confirmation.html` and **Reset password** with `supabase/templates/recovery.html`. They use `{{ .RedirectTo }}#token_hash={{ .TokenHash }}`. `/auth/confirm` clears the fragment before sending the token by POST, and requires a deliberate confirmation click so email scanner GETs do not consume a link. A recovery link creates a signed 15-minute proof bound to the authenticated user. Successful reset signs out global sessions and returns to login. Supabase must have Confirm Email enabled; do not auto-confirm users using an admin API to simulate verification.

Configure **Supabase Auth SMTP in the dashboard** for external verification and recovery email. Its default delivery service is restricted and is not a dependable public-registration setup. Configure application `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` and `SMTP_REQUIRE_TLS` separately for organization invitations. The invitation SMTP adapter requires TLS by default; use port 465 for implicit TLS. For a local intercepted mailbox only, TLS can be disabled explicitly. If invitation SMTP is absent or fails, the authorized administrator receives a private link for secure manual delivery, with its delivery state clearly shown. SMTP acceptance is not proof of inbox delivery.

Invitations store SHA-256 hashes, not raw tokens; expire after seven days; bind to the verified Auth email; and assign the stored invited role server-side. Resend rotates the token and invalidates the old link. Revoke prevents acceptance. Duplicate creation/acceptance is idempotent; a duplicate creation does not send a new, invalid token. Active existing memberships are never silently upgraded by accepting an invitation. Administrators can auditably change other members' roles or remove access. Removal keeps historical foreign keys but all membership authorization ignores revoked rows. No form field can directly join an existing organization or grant a role.

A recording owner or administrator can withdraw evidence by typing its exact title. Withdrawal retires dependent revisions, clears active pointers, removes chunks and invalidates guides in one transaction. It preserves immutable evidence and audit history under private retention; it does **not** perform physical erasure. Previously issued download URLs expire within five minutes.

## Local Auth email testing

The checked-in `supabase/config.toml` enables confirmed public signup and the fragment templates. `supabase start` starts a disposable local Supabase stack with an intercepted Mailpit mailbox; `supabase status` supplies its URLs and local credentials. This configuration uses application origin `http://127.0.0.1:3100` to keep local verification separate from your existing `.env.local` project. Launch a separate Next.js process with matching environment variables and `npm run dev -- --port 3100`. Obtain values from your own local stack; do not substitute fabricated provider credentials. Configure local invitation SMTP if testing email delivery there. Emails viewed in Mailpit are **locally intercepted**, not external delivery.

Run `npm run typecheck`, `npm run lint`, `npm test`, and PostgreSQL integration tests with `ALVIS_TEST_DB_CONTAINER` and `ALVIS_TEST_DB_NAME` pointing to a disposable database with migrations applied. The PostgreSQL harness substitutes Auth identities only inside database tests and does not verify Supabase signup/email delivery. On Windows, browser checks can use `$env:ALVIS_BROWSER_CHANNEL='chrome'; npm run test:e2e`. `ALVIS_TEST_BASE_URL` selects an already-running separate test server. Auth/private evidence traces are disabled to avoid retaining credentials. See [release verification](docs/release-checklist.md), [staging and rollback](docs/deployment.md), and [Moonshot preparation](docs/moonshot-demo.md).

### Onboarding troubleshooting

- No verification email: check Confirm Email, Auth SMTP, allowed recipients, rate limits, spam, and the configured templates. `/verify-email` requests a fresh link without reporting whether an account exists.
- Link missing/expired/used: reopen the original email or request a fresh one. Authentication links are deliberately single-use. Recovery additionally requires the same browser's valid proof cookie.
- Empty dashboard: new workspaces are intentionally empty. Add a training asset and invite an expert and a reviewer in Settings; do not seed ordinary organizations.
- Invitation rejected: sign in with the intended verified email. Check expiry/revocation or ask the administrator to resend. Resend invalidates all earlier links.
- Settings unavailable: apply migration 007; evidence withdrawal needs 008 and demo reset needs 009. Never use test Auth/storage bootstrap files on a hosted project.

## Week 4 release evidence

The current [release evaluation](docs/release-evaluation.md) and [checklist](docs/release-checklist.md) supersede earlier milestone verification notes. Run `npm run release:preflight` for read-only configuration, schema, private-bucket, RPC permissions and vector-dimension checks. It never claims jobs or changes hosted data. Missing checks fail the command rather than implying release readiness.

For real local signup/invitation tests against the separate running local stack and web server:

```powershell
$env:ALVIS_BROWSER_CHANNEL='chrome' # Or install Playwright Chromium: npx playwright install chromium
$env:ALVIS_TEST_BASE_URL='http://127.0.0.1:3100'
$env:ALVIS_TEST_MAILBOX_URL='http://127.0.0.1:54324'
npx playwright test tests/e2e/onboarding-live.spec.ts
```

The application server must use that stack's actual URL/publishable/service keys, `ALVIS_SITE_URL` matching port 3100, a recovery secret, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325`, a local sender, and `SMTP_REQUIRE_TLS=false` for intercepted SMTP only. Do not point these account-creating tests at production. No external delivery is claimed. Use a separate `ALVIS_NEXT_DIST_DIR` when two Next.js processes run from this checkout. If Windows development-cache rename locks recur, stop the owned development process, build the isolated directory with the matching public settings, then use `npm run start -- --port 3100` with the same directory and server configuration. Avoid running multiple development processes against the same cache.

The local storage config permits 100 MiB; application checks still limit recordings to 100 MB and 180 seconds. Verify the hosted project's global upload limit as well as the private bucket limit. Container FFmpeg checks do not prove processing a real recording; execute the complete consented workflow before demo sign-off.
