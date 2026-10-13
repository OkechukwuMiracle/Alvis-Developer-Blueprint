# Alvis — separated client and server

Alvis preserves expert judgment as reviewed, evidence-linked knowledge and contextual learning. This is one repository with independent applications; the existing Next.js frontend and backend route-handler framework are retained.

```text
client/                   Next.js pages, components, CSS, browser API transport, Playwright tests
server/src/app/api/       Backend HTTP endpoints
server/src/config/        Required configuration, cookie options, allowed origins
server/src/middleware/    CORS, mutation-origin checks, authenticated organization context
server/src/database/      Supabase and authorized queries
server/src/services/      Authentication, onboarding, review, storage, email, OpenAI, read views
server/src/jobs/          Durable media/transcription and indexing/lesson workers
server/supabase/          Migrations 001–012, local stack config and email templates
server/tests/             Unit and PostgreSQL workflow/authorization tests
server/docs/              Release verification, deployment and Moonshot documentation
shared/src/               Browser-safe types, schemas and pure validation helpers
alvis-blueprint/          Preserved product specification, prompts and synthetic fixtures
scripts/                  Root development orchestration and opt-in local Auth test setup
```

## Install and configure

Use Node.js 24 and npm. Install once at the repository root with `npm ci`; the root workspace lockfile is authoritative. Do not install independent nested dependency trees. Copy `client/.env.example` to `client/.env.local` and `server/.env.example` to `server/.env.local` for a new checkout. The existing local environment was moved into `server/`, with its actual values preserved and provider URL/key renamed. Only public API/site URLs were written to `client/.env.local`.

| Application | Settings |
| --- | --- |
| Client, browser-safe | `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:4000`), `NEXT_PUBLIC_SITE_URL` (default `http://127.0.0.1:3000`) |
| Server API | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALVIS_SITE_URL`, `SERVER_PORT`, `CORS_ALLOWED_ORIGINS`, recovery/cookie settings |
| Server processing | Existing `OPENAI_MODEL_TEXT`, actual `OPENAI_API_KEY`, `OPENAI_MODEL_STT=whisper-1`, separate `OPENAI_MODEL_EMBED`, private S3/storage credentials, FFmpeg paths |
| Server email / maintenance | Invitation SMTP settings, demo-workspace and external account/recording paths |

No OpenAI, privileged database, S3, SMTP, recovery or worker secrets belong in the client. A Supabase project URL/publishable key is public by provider design, but the frontend does not require a direct database connection and these settings now live in the backend. Never expose service-role keys through `NEXT_PUBLIC_*`.

The API launcher explicitly loads `server/.env.local` and validates required API settings with errors naming missing variables, never their values. Processing jobs explicitly load the same server file and enforce their additional prerequisites. `ALVIS_ENV_FILE` selects another server environment file for local testing or deployment. Production can inject variables directly rather than shipping files. Public client values must be set at build time.

Apply every SQL file under `server/supabase/migrations/` in filename order to the appropriate development/staging Supabase project. Never apply test Auth/storage harnesses to a hosted project. Migration 010 locks down explicit Supabase default RPC grants; migration 012 provides a read-only permissions check. The configured embedding output must match the 1536-dimensional vector column. Do not substitute fake vectors into normal processing.

## Development commands and ports

```powershell
npm run dev              # client 3000 + API server 4000
npm run dev:client       # frontend only
npm run dev:server       # API only
npm run worker           # durable media/transcription/extraction worker
npm run worker:learning  # durable indexing and lesson worker
npm run dev:all          # both applications and both workers; requires complete processing setup
```

Open http://127.0.0.1:3000/. API health: http://127.0.0.1:4000/api/health. Health checks configuration presence, not provider reachability. Use the **same hostname** in both origins: `127.0.0.1` everywhere or `localhost` everywhere. Cookies are hostname-scoped, not port-scoped. If a port is occupied, choose `SERVER_PORT` in the server environment and update the public client API URL; use `CLIENT_PORT` for the root orchestrator or `npm run dev --workspace @alvis/client -- --port 3002`, then update both frontend origin settings and CORS.

FFmpeg and ffprobe must be installed on the media-worker host (or use the worker image). `FFMPEG_PATH` and `FFPROBE_PATH` can name absolute executables. Workers process durable database jobs with bounded retries and lease fencing; a running web UI alone does not transcribe or index recordings. Single-pass diagnostics: `npm run worker:once --workspace @alvis/server` and `npm run worker:learning:once --workspace @alvis/server`.

## Authentication transport, CORS and CSRF

Authentication remains real Supabase email/password verification with **server-managed HttpOnly cookies**. The frontend never handles service credentials or validates its own membership. Browser `apiFetch` uses `credentials: include`; SSR and thin frontend form actions forward session cookies through the same central API transport. The backend verifies the Auth user and active organization membership, then relies on scoped queries and RLS/RPC authorization. Its organization cookie selects only an existing authorized membership; request bodies cannot grant access or roles.

`CORS_ALLOWED_ORIGINS` is an explicit comma-separated list of exact frontend origins. Defaults include `http://127.0.0.1:3000,http://localhost:3000`; configure exact HTTPS staging/production origins. The backend reflects only a listed origin and sends `Access-Control-Allow-Credentials: true`. No wildcard is permitted. OPTIONS validates the requested method and headers; allowed headers are Content-Type, Authorization and Idempotency-Key, and methods are GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS. Unapproved origins receive 403 with **no permissive CORS header**. Native requests with no Origin can read only what authentication permits; mutations also require an approved Origin. CORS is not authorization. Authorization is an allowed CORS header, not a newly added bearer-login mode.

Cookie attributes are HttpOnly, Path=/, SameSite=Lax, Secure in production (or with `AUTH_COOKIE_SECURE=true`). Local HTTP defaults to non-Secure cookies. Keep `AUTH_COOKIE_DOMAIN` empty locally and for a single-host deployment. For same-site `app.example.org` / `api.example.org`, set an explicitly trusted shared parent cookie domain on the backend and HTTPS on both. This is needed for frontend SSR to receive cookies. Completely unrelated frontend/API domains are **not supported by this cookie-preserving refactor**; route `/api/` to the backend on the frontend hostname instead. Do not weaken cookies to work around that boundary.

Recommended staging ingress: one HTTPS hostname, `/api/*` routed to server:4000 and remaining paths to client:3000. Set the public API base URL and site URL to that hostname, `ALVIS_SITE_URL` and the CORS list to its origin. The client has a transport-only API rewrite for local compatibility; it implements no backend business logic. Form server actions are forwarding adapters, not database services.

## Signup, email and onboarding

Invitation acceptance requires signing in with the exact verified email used by
the administrator. The invitation page displays the current account so a sender
does not accidentally accept for the recipient. A pending invitation can exist
before its recipient has registered or verified their email. For duplicate pending
invitations, use **Resend** on the existing row instead of creating another one;
resending replaces the old link. Use the latest link in the recipient's browser
session. Expiry/revocation and wrong-account checks remain enforced in the
database. Unknown RPC or permission errors are service failures, not evidence
that a link is expired.

Set `ALVIS_SITE_URL` to the frontend origin. Configure Supabase Auth Site URL and exact allowed redirects `/auth/confirm` and `/auth/callback` there. Enable public email/password signup and Confirm Email. Install `server/supabase/templates/confirmation.html` and `recovery.html` in Supabase Auth Email Templates; links use fragments, a deliberate confirmation click and POST. Configure an actual random `ALVIS_AUTH_FLOW_SECRET` of at least 32 characters on the server for the 15-minute recovery proof. Do not publish it.

Configure Supabase Auth SMTP for verification/recovery email, and application SMTP separately for invitations. See `server/.env.example`. Missing/failed invitation SMTP permits clearly identified manual private links; SMTP acceptance is not inbox delivery. Never log passwords, invitation/verification links, signed recording URLs or request bodies. Disable email-provider link tracking and redact callback query strings at ingress.

New verified users create an empty organization atomically or accept a verified-email-bound invitation. Admins add assets and invite distinct experts/reviewers/workers. Public signup cannot self-assign a role in an existing organization; admins cannot approve as reviewers merely because they are admins. Synthetic fixtures are confined to explicitly flagged demo/test workspaces. Ordinary use does not require seeded identities.

## Verification

### Missing database tables / Home unavailable

Authentication can work even when the application's database migrations have
not been installed. Run `npm run db:check --workspace @alvis/server` from the root
to check the actual project in `server/.env.local` without printing credentials.
`PGRST205` means a table is absent from the API schema; it is not a CORS error.

For a new development/staging Supabase project, install Supabase CLI, then run:

```powershell
cd server
supabase login
supabase link --project-ref <your-project-reference>
supabase db push --dry-run
supabase db push
cd ..
npm run db:check --workspace @alvis/server
```

Use the project reference matching `SUPABASE_URL`, and supply the database
password when prompted. Apply all seventeen migrations in `server/supabase/migrations/`
in order. Do not reset an existing remote database. Service-role API keys cannot
execute schema migrations. If using SQL Editor instead of CLI, migration history
must subsequently be reconciled before future CLI deployment. After successful
setup, refresh Home; accounts without membership proceed to organization onboarding.

If identity returns `DATABASE_SETUP_REQUIRED` after the community update and
`db:check` finds missing `scope_kind`, `audience`, or community tables, your existing
001–012 database needs migrations 013–017. Back up that project, then run:

```powershell
npm run db:prepare-community --workspace @alvis/server
```

Open `server/var/tmp/community-upgrade.sql`, copy its complete contents into the
**SQL Editor of the Supabase project matching `server/.env.local`**, and run it.
The bundle applies the five additive migrations atomically, preserves existing
organization records, and refuses an already started community upgrade. It does
not execute remotely or contain credentials. Run `npm run db:check --workspace
@alvis/server` afterwards; all tables should report accessible. Refresh the page.
If the project has a partially applied community upgrade, inspect its migration
history and apply only the remaining files in order instead of using this bundle.
For SQL Editor upgrades, reconcile CLI migration history before later `db push`.

### Confirmation links

Personal signup includes a community role (Worker/Learner by default). After email
verification, the server activates the owner-bound personal workspace and opens
`/community/home` directly. A remembered invitation from an earlier visit does not
override personal signup. Explicit invitation signup (`next=/invite`) still opens
invitation acceptance; organization signup retains organization onboarding.
If activation fails, onboarding offers a retry rather than displaying a dashboard
without a valid workspace. Community migrations 013–017 must be installed.

If signup is rate limited (HTTP 429), stop repeated submissions and check
Supabase Dashboard → Authentication → Rate Limits and Auth logs. The built-in
email service is restricted to project-team addresses and has a low email quota.
For public signup, configure **Supabase Auth** custom SMTP under Authentication
→ Email/SMTP settings, including sender verification. The application's
`server/.env.local` SMTP variables are for invitations; setting them does not
configure Supabase's hosted verification/recovery email service. Keep email
confirmation enabled. Rate limits and email-provider delivery problems require
provider-side configuration; application code cannot bypass them.

The confirmation page accepts token hashes in a fragment or query string and
Supabase PKCE `?code=` redirects. PKCE links must be opened in the browser used
to register. The recommended **Confirm signup** email template is
`server/supabase/templates/confirmation.html`; install its HTML in Supabase
Dashboard → Authentication → Email Templates → Confirm signup. Its link must
include `{{ .RedirectTo }}#token_hash={{ .TokenHash }}&amp;type=email`, not just
`{{ .RedirectTo }}` or `{{ .SiteURL }}`. Configure Site URL and allowed redirect
URLs for the exact frontend hostname, including `/auth/confirm` and
`/auth/callback`. Do not mix localhost with 127.0.0.1. After changing templates,
request a fresh email; old messages are not rewritten. A bare `/auth/confirm`
URL cannot verify an account. Email link tracking must preserve the fragment.

If a newly received email reports missing browser proof, the default Supabase
PKCE email is still in use. Its code requires the original signup cookie; a new
signup or recovery request can overwrite that verifier, and another browser or
hostname cannot read it. Replace the hosted **Confirm signup** template with
`server/supabase/templates/confirmation.html` and request a fresh email. This
uses a token hash verified server-side after the confirmation button is pressed,
so it does not require the signup browser. The repository template does not
automatically update hosted Supabase. For development, start signup at
`http://127.0.0.1:3000/signup`; email-flow pages redirect to the configured
`NEXT_PUBLIC_SITE_URL` to prevent localhost/127.0.0.1 cookie mismatches.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run release:preflight
$env:ALVIS_BROWSER_CHANNEL='chrome' # Or: npx playwright install chromium
npm run test:e2e
```

For PostgreSQL integration tests, use a disposable pgvector PostgreSQL database. Apply `server/tests/integration/bootstrap.sql`, migrations 001–003, the test-only storage harness, then 004–012. Set `ALVIS_TEST_DB_CONTAINER` / `ALVIS_TEST_DB_NAME` and run `npm run test:integration`. Wait for `pg_isready` after starting the container. These tests use synthetic content/vectors and test Auth identities; they are not model evaluations or real signup proof.

For real local account tests, start the local Supabase stack from `server/`; its project ID remains `alvis-app` to preserve the existing local database volume. If it was created before the folder move, stop/recreate its containers **without deleting volumes** so email-template bind mounts use the new paths. Local Auth redirects target port 3100 and Mailpit intercepts email.

```powershell
node scripts/local-auth-setup.mjs # Requires running actual local Supabase; writes ignored local test environments
# Terminal 1, from root:
$env:ALVIS_ENV_FILE='.env.local-auth'
npm run dev:server              # API 4100; separate build directory
# Terminal 2, from root:
$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:4100'
$env:NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3100'
$env:ALVIS_NEXT_DIST_DIR='.next-refactor-auth'
npm run dev --workspace @alvis/client -- --port 3100
# Terminal 3, from root:
$env:ALVIS_BROWSER_CHANNEL='chrome'
$env:ALVIS_TEST_BASE_URL='http://127.0.0.1:3100'
$env:ALVIS_TEST_MAILBOX_URL='http://127.0.0.1:54324'
npm run test:e2e -- --grep 'actual signup|three invited roles'
```

The opt-in setup reads real local CLI credentials and preserves configured model choices; it never invents provider credentials or changes the main local environment files. Supabase CLI must be installed, or selected with `SUPABASE_CLI`. Emails are **locally intercepted**, not externally delivered. Auth tests disable traces/video/screenshots. Sensitive account and evaluation files belong outside Git. Full recording/model and approved learning journeys skip explicitly when actual media/accounts/indexed context are absent.

See [refactor verification](server/docs/client-server-refactor.md), [Week 4 checklist](server/docs/release-checklist.md), [observed release evaluation](server/docs/release-evaluation.md), and [Moonshot presenter/reset instructions](server/docs/moonshot-demo.md). Earlier milestone observations are retained and are not claims about the refactor's live verification.

## Deployment and Git hygiene

`Dockerfile` has separate client, server and worker targets. `compose.staging.yml` starts the two applications and the two workers. Supply `client/.env.staging` (public values) and `server/.env.staging` (private settings), then:

```powershell
docker compose --env-file client/.env.staging -f compose.staging.yml build
docker compose --env-file client/.env.staging -f compose.staging.yml up -d
```

Provide HTTPS ingress using the cookie topology above. Both host ports are loopback-bound by default. Client build arguments are public URLs only; backend secrets are runtime configuration. The worker image includes FFmpeg/ffprobe. Staging must separately verify redirects, external SMTP, private storage, dimensions, permissions, durable workers and the complete recording-to-learning journey. See [deployment/rollback](server/docs/deployment.md). No production resources are changed by this refactor.

Root/application `.gitignore` files exclude actual environments, dependencies, Next output, coverage, test traces/reports, private evaluation JSON, local Supabase metadata, logs, temporary uploads/media, editor-local files and OS metadata. Examples, source, manifests, the root lockfile, intentional fixtures, schemas, migrations and useful configuration remain trackable. This workspace had no Git repository/history before the refactor; Git was initialized without rewriting history. There were no previously tracked secret files to untrack. `.gitignore` never removes credentials from existing history; if a later audit finds committed credentials, rotate them and report filenames without values.

## Personal and public community accounts

Signup now supports a personal account without an organization. After email verification,
activate Expert, Community Reviewer, or Worker/Learner at `/onboarding`. All personal
roles can discover, ask and learn. Create or join private organizations later with the
same identity, and use the workspace selector to switch context. Community roles never
grant organization permissions. Organization knowledge remains private and is excluded
from community retrieval; public knowledge does not silently enter organization Ask.

Visitors can browse `/community/library` and public profiles. Personal captures and
drafts stay private. Experts explicitly preview saved content and select supporting
excerpts before requesting community review. Assigned reviewers inspect those excerpts;
raw recordings are not published. Approved, active, indexed contributions become
discoverable. Guides use reviewed steps, lessons require separate review, assessments
are scored on the server, and personal history is private. Community reviewed is peer
review, not verified credentials, certification or guaranteed correctness.

Back up your database and apply `server/supabase/migrations/202610120013_*` through
`202610120017_*` after 001–012, in order, using the existing Supabase migration process.
The backfill preserves IDs and review history and explicitly marks old content private.
No new model, CORS or browser configuration is required. Existing worker commands are
reused for personal media, indexing and lesson generation. See [migration/rollback](server/docs/community-architecture.md),
[permissions](server/docs/community-permissions.md), and [onboarding](server/docs/community-onboarding.md).

```powershell
npm run typecheck
npm run lint
npm test
npm run test:postgres --workspace @alvis/server
npm run test:backfill --workspace @alvis/server
$env:ALVIS_BROWSER_CHANNEL='chrome' # Optional installed Chrome instead of downloaded Chromium
npm run test:e2e -- --grep 'community public discovery|signup supports personal'
```

The direct SQL command uses only the disposable local Supabase database on port 54322.
For the real personal-signup browser test, prepare existing local Auth environments,
run client 3100/API 4100, and set `ALVIS_TEST_BASE_URL` and `ALVIS_TEST_MAILBOX_URL` as
in the local Auth instructions above. Run `--grep 'actual personal signup'` separately.
UI tests labeled intercepted fixture do not verify live capture or model generation.

The complete community review-to-learning browser journey is explicitly opt-in:
set `ALVIS_TEST_SYNTHETIC_COMMUNITY=1` and run
`--grep 'community publication and learning'`. It creates real local Auth accounts
and private synthetic fixtures only in their personal scopes. The synthetic index
uses a separate model marker; it is not an embedding-provider evaluation. Lesson
fixtures pass the real worker validator and need a separate authenticated reviewer
decision. Cleanup withdraws only the test's own contribution. See the [community
verification report](server/docs/community-verification.md) for observed results and limits.
