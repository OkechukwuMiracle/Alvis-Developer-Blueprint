# Client/server refactor verification

The frontend remains Next.js in `client/`. The API-only Next.js application in
`server/` owns authentication, authorization, database access, business logic,
OpenAI integrations and durable jobs. `shared/` contains public contracts and
validation only. Root npm workspaces use one lockfile.

## Observed results

| Check | Result |
| --- | --- |
| Separate client and API production builds | Passed before final transport/startup refinements |
| Type checking and linting | Passed for both applications |
| Unit tests | 24 passed, including CORS tests |
| PostgreSQL authorization/workflow suites | Seven passed; external Auth integration skipped |
| Root development startup | Both applications ready on 3000/4000; HTTP responses checked |
| Allowed-origin preflight | 204, exact origin and credentials headers |
| Unapproved origin | 403, no permissive CORS headers |
| Unauthenticated requests with/without Origin | 401 independently of CORS |
| Frontend static secret scan | 24 generated files checked; no configured backend secret matches |
| Real signup/invitation/recovery | Local Supabase and intercepted Mailpit email exercised; individual desktop/mobile runs passed, final combined reruns did not pass |
| Final browser regression suite | Six passed, 12 failed; disk full and interrupted development-server runs prevent a clean result |
| Synthetic publication journey | Added, but not successfully completed in final verification |
| Current media worker startup | Blocked: local FFmpeg missing; retained image has a damaged shared library |
| New worker Docker build | Failed: npm registry download timeout |
| FFmpeg download | Failed/incomplete due download timeouts and DNS failure |
| Live capture/transcription/model evaluation | Not tested in this refactor |
| Staging deployment/external email | Not tested or deployed |

Earlier passing checks do not substitute for final end-to-end release verification.
The C: drive subsequently reached zero free bytes. Automatic approval review
rejected removal of a verified Alvis-generated cache directory with “blocked by
policy.” No source, environment files or database volumes were deleted.

## Reproduction and remaining requirements

Follow the root README for environment setup and independent commands. Free disk
space before rebuilding or running browser tests. Install working FFmpeg/ffprobe
or rebuild the worker image with registry connectivity, then verify both worker
commands against the configured backend. Run final builds and browser regressions
again after these prerequisites are restored.

The optional `ALVIS_TEST_SYNTHETIC_WORKFLOW=1` browser test uses real accounts and
review actions but operator-inserted, labeled synthetic evidence and simulated
index vectors in its own local demo organization. It is not live capture,
embedding, extraction or answer-generation proof. Mailpit interception is not
successful external delivery.

Use same-site HTTPS client/API hosts with an explicitly scoped shared cookie
domain, or one HTTPS ingress forwarding `/api/` to the backend. Configure exact
CORS origins, Supabase redirects, runtime secrets, private storage, SMTP and
worker connectivity before staging. Authorization remains server-side; CORS
cannot grant membership. Backend keys must never enter client configuration.

No pre-existing Git history was present. Real environments and generated files
are ignored; no credentials were removed from history or history rewritten.

Release recommendation: the separation is implemented, but release acceptance
remains incomplete until final browser, worker and live recording-to-learning
verification passes. Retain the existing deployment until those checks pass;
rollback by restoring its image/configuration and preserved database volume.
