# Personal/community verification

12 October 2026. Application code remains in `client/`, `server/`, and browser-safe
`shared/`. Main environment files and configured OpenAI models were preserved.
Migrations 013–017 were applied only to local Supabase and disposable local test
databases. They have **not** been applied to the hosted project.

## Observed results

| Check | Status | Evidence and limits |
| --- | --- | --- |
| TypeScript, client and server | Passed | Root `npm run typecheck` |
| ESLint, client and server | Passed | Root `npm run lint` |
| Unit checks | Passed | 29 tests; scope selection, citations, safety, schemas, CORS and existing authentication contracts |
| Browser credential/Git scan | Passed | 463 browser JavaScript/source-map files inspected against configured backend credential values without printing them; no secret/generated Git candidates found |
| Actual SQL workflow and authorization | Passed | Community, onboarding, organization review, capture, learning, storage, withdrawal and function-permission suites |
| Existing-record additive upgrade | Passed | Separate database runs 001–012 with synthetic organization data and a historical review, then 013–017; IDs, roles, content, relationships, review/audit history and private audiences retained |
| Public desktop/mobile interface | Passed | Four browser checks; public knowledge/profile/excerpts use explicitly intercepted synthetic API projections; signup choices and unauthenticated tool protection use the application |
| Real personal onboarding | Passed | Desktop and mobile; actual Supabase signup and locally intercepted verification, Expert/Reviewer/Learner profiles, role separation, deterministic hazard escalation, later organization creation and identity-preserving switches after refresh |
| Existing organization onboarding | Passed | Desktop/mobile actual signup, verification, empty organization, assets, existing-account invitation acceptance and password recovery |
| Community review and learning browser journey | Passed | Desktop/mobile real expert, reviewer and learner accounts; synthetic private draft → explicit selected excerpts → claimed independent review → indexing gate → separately reviewed lesson → permitted public sources → refresh-safe reviewed guide → hidden keys → server scoring → private history → new correction draft |
| Live recording/transcription/extraction/debrief | Blocked | FFmpeg/ffprobe are absent from PATH; no real `ALVIS_LIVE_RECORDING` or expert-authored `ALVIS_LIVE_DEBRIEF_FILE` was provided |
| Positive live community model answers and embeddings | Untested | Provider settings are present, but no provider request was made in this milestone; the positive SQL/browser indexing tests use labeled synthetic vectors |
| External email delivery | Untested | Verification/recovery messages were intercepted locally; organization invitation integration remains configured, but this does not establish external SMTP delivery |
| Hosted migration, production builds and staging | Untested | No hosted database or production resources were changed; staging deployment was not performed |

The hosted database diagnostic was run read-only and **failed** for the new scope,
audience and community schema. Existing membership/assets/knowledge-unit/audit
tables were accessible. Apply 013–017 to that configured project before using the
new application version; credentials alone do not create these tables or policies.

The SQL community suite uses actual database roles and RPCs, but synthetic auth
rows, evidence, vectors and lesson output. It checks private drafts/recordings,
unassigned-reviewer evidence denial, self-review denial even with reviewer
eligibility, invalid evidence citations, rate limits, durable lesson finishing
under `service_role`, independent lesson approval, hidden keys, server scoring,
duplicate submissions, correction/replacement, retirement and guide invalidation.
The backfill suite runs its upgrade in a transaction and rolls it back.

The community browser journey creates real local accounts through signup and
verification, then injects explicitly synthetic processing inputs into only its
expert's designated synthetic/demo personal scope. Its scoped worker finisher exercises actual validators;
vectors use `browser-fixture-only`, never the configured embedding model. It does
not upload, transcribe or extract a recording, and it does not generate a live
lesson or source-grounded model answer. The separate hazard test exercises the
actual deterministic escalation path with no provider call.

The supplied demo lesson is shorter than the production 130–195-word gate. A
test-only adapter extends its explanation using unchanged reviewed claims and
their evidence IDs; production validation is preserved and blueprint fixtures
are unchanged. Generated lessons still require schema/evidence validation and
independent human approval.

## Reproduction and outstanding setup

Use the root README's commands for unit/type/lint, direct PostgreSQL, backfill
and browser tests. SQL tests target only 127.0.0.1:54322 and named disposable
databases; they do not load hosted credentials. Real Auth browser tests require
the actual local Supabase/Mailpit setup and client 3100/API 4100. Opt in to the
synthetic processing browser journey with `ALVIS_TEST_SYNTHETIC_COMMUNITY=1`.
Cleanup withdraws only that test contribution; it never resets another workspace.

Install FFmpeg and ffprobe, or supply absolute `FFMPEG_PATH` and `FFPROBE_PATH` in
the server environment. Supply an authorized short training recording and real
expert debrief inputs outside Git before running the live capture journey. Existing
private S3, STT, text and embedding settings remain server-only. No credentials
were invented. No capture/Ask model latency, provider usage or cost is claimed.

Back up the hosted database and apply 013–017 after 001–012 before deploying this
application version. Verify email callbacks, private storage, workers and actual
models there. See the architecture document for additive rollback guidance.

C: became full during early browser attempts and Next failed to compile the
confirmation page. Automatic review blocked deletion of a generated test cache;
the cache was retained. Compressing generated JavaScript preserved its content
and freed some space. Ignored `.next-community-check` junctions put later test
output on E: under `Alvis-Community-Verification-20261012`, with no source or
environment-file relocation. Initial browser failures also exposed test timing,
locator and worker-role fixture issues; these were corrected before successful
runs. These machine-specific output paths are not deployment requirements.

The extension is ready for local functional demonstration of community review
and learning with honestly labeled synthetic processing. A live recording/model
demonstration remains unverified and needs the setup and full rehearsal above.
