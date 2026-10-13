# Week 4 release checklist

Verification date: 9 October 2026. PASSED means observed in the environment specified; it does not imply staging verification. BLOCKED requires configuration, consented media, or authorization. UNTESTED means no completed observation. FAILED identifies an observed unresolved failure.

| Item | Status | Evidence / remaining work |
| --- | --- | --- |
| Public landing, product scope, navigation, signup actions, metadata | PASSED | Production build, local HTTP 200 and final desktop/mobile public/anonymous checks: 18 passed, 2 live learning journeys skipped. |
| Real signup, email verification, empty organization creation | PASSED locally | Actual local Supabase Auth and intercepted Mailpit verification emails; no seeded identities. |
| Existing-account and new-account invitations | PASSED locally | Browser signup/invitation journeys; authorized SQL acceptance assigns roles. External delivery remains untested. |
| Password recovery and fresh login | PASSED locally | Mobile account journey reset a real password and logged in again; reused recovery link rejected. |
| Duplicate/interrupted onboarding, wrong-email/expired/revoked/reused invitations | PASSED database | Actual PostgreSQL authorization/idempotency suites; interrupted browser request transport has not been separately fault-injected. |
| Organization isolation, role authorization, hidden lesson keys, scoring, revision retirement | PASSED database/unit | Seven PostgreSQL suites; 21 unit tests. Synthetic test content and embeddings are clearly distinct from live model evaluation. |
| Worker RPC permission lockdown | PASSED locally; BLOCKED hosted | Migration 010 removes Supabase's explicit default grants. Local Supabase ACL test passes. Apply 010 and read-only checker 012 to the hosted project and verify. |
| Evidence withdrawal retires dependent knowledge and invalidates guides | PASSED database | Withdrawal integration suite. Private media is retained; previously issued download links can remain valid for up to five minutes. |
| Capture creation and assessment retry idempotency | PASSED database | Stable request keys; client persists pending assessment selections without answer keys. Full media/assessment browser journey remains blocked. |
| Bounded retries / expired worker lease recovery | PASSED database | Existing capture/indexing suites retained and rerun. No live provider outage injection. |
| Type checking, lint, production build | PASSED | Latest source checks and both ordinary and isolated local production builds. |
| Runtime dependency security audit | PASSED | `npm audit --omit=dev`: zero vulnerabilities. |
| Development dependency audit | FAILED | Five high transitive development findings involving braces; advisory has no patched braces version at verification. Avoid forced framework downgrades; monitor GHSA-vfj7-8cjw-p6xm. |
| Hosted embedding dimension / RPC readiness | BLOCKED | Read-only preflight could not resolve the vector-dimension RPC. Apply required migrations and verify 1536 dimensions against the selected embedding model. |
| External verification/recovery/invitation email delivery | UNTESTED / BLOCKED | Local SMTP interception succeeded; configure provider Auth SMTP and separate application invitation SMTP, then test an external inbox. |
| Complete consented recording through reviewed learning/history | BLOCKED | No supplied consented training recording and expert-confirmed debrief. No live STT/extraction/indexing/semantic answer success claimed. |
| Full supplied semantic evaluation cases | BLOCKED | Evaluation runner executed zero cases; 15 marked blocked without configured evaluation accounts/live indexed context. |
| Staging deployment and worker connectivity | BLOCKED | Container/compose configuration prepared; no available authorized staging origin/environment. Host FFmpeg/ffprobe absent; worker container provides them. |
| Final container images | UNTESTED | Earlier worker image built and FFmpeg/ffprobe 5.1.9 ran. Final-source rebuild stalled at dependency installation and was stopped; rebuild web and worker before deployment. |
| Two 5:30 rehearsals, saved-run and recorded fallback | UNTESTED | Presenter script and scoped reset supplied; rehearsals and recordings require the complete reviewed workflow first. |

Release decision: **not ready for a live capstone demonstration or staging sign-off**. The public/account foundation is ready for further local review. Do not imply that locally intercepted email proves external delivery, that synthetic database fixtures prove model grounding, or that a passed knowledge check establishes practical competence.

Before release, complete hosted migrations/ACL and vector checks, recovery secret configuration, real external delivery, one consented end-to-end workflow with distinct expert/reviewer/worker accounts, staging checks, and two rehearsals. Record image digests and timings, then update this checklist. See [deployment](deployment.md), [evaluation](release-evaluation.md), and [presenter/reset instructions](moonshot-demo.md).
