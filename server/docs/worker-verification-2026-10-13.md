# Worker repair and verification — 13 October 2026

The tested story is capture media → worker preparation → live transcription;
release checks also cover configured database access, embeddings and API boundaries.
This report supplements earlier release reports; it does not mark the entire release passed.

## Fixes

- A downloaded FFmpeg archive had not been extracted. `npm ffmpeg -version`
  reported npm's version, not FFmpeg's. Extracted the existing Gyan Windows build
  outside the repository and set explicit FFmpeg/ffprobe paths in ignored
  `server/.env.local`. Both workers start successfully.
- An existing VP9/Opus WebM upload had no container-duration header and failed
  with `INVALID_DURATION`. The worker now measures packet timestamps for
  headerless WebM, with bounded probing and existing decoded-media/size/duration
  checks retained. MP4 and explicit invalid durations retain their existing rules.
- Added `npm run media:check --workspace @alvis/server` for real binary and media
  preparation verification using generated MP4 and headerless WebM.
- Corrected a browser test to assert 403 and absent permissive CORS headers,
  rather than requiring JSON from intentionally empty CORS rejection responses.
- Allowed 30 seconds for landing-to-signup navigation during cold development
  compilation; the same navigation and form assertions remain.

## Observed results

| Check | Result | Evidence / limitation |
|---|---|---|
| FFmpeg / ffprobe | Passed | Both binaries respond; preflight no longer blocks them. |
| Media worker | Passed startup | `worker:once` started and claimed an existing media job. That job initially failed duration validation before the fix. |
| Learning worker | Passed startup | `worker:learning:once` verified database dimension 1536. |
| Generated media | Passed | Actual FFmpeg decoding, checksum validation and WAV extraction for two-second MP4 and headerless WebM. No model or consent claim. |
| Existing private recording | Passed preparation | Authorized short-lived storage download; VP9/Opus WebM, measured duration 8.59 seconds, extracted audio 8.58 seconds. Temporary files removed. |
| Live transcription | Passed provider call | Existing recording produced one timestamped segment; provider latency 4,860 ms, audio duration 8.58 seconds. Diagnostic run only: transcript was not saved into the workflow. No transcript text logged. |
| Live embeddings | Passed | Actual configured provider returned 1536 dimensions. Measured calls: 7,537 ms overall, then 2,428 ms provider latency; latter reported 4 input/total tokens. No cost estimate claimed. |
| SMTP | Passed connection/TLS/auth | Nodemailer verify succeeded. No email sent; external inbox receipt remains untested. |
| Hosted setup | Passed checked gates | Schema access, RPC ACL checker, private bucket, public-signup/verification settings and vector dimension passed preflight. These do not prove every database workflow. |
| Type checking | Passed | Root type checking, plus server checking after media fix. |
| Lint | Passed | Root lint and server lint; temporary diagnostic unused-import warning subsequently removed and server lint rerun clean. |
| Unit tests | Passed | 34 tests including packet-derived duration and recording/audio duration boundaries. |
| Browser tests | Mixed / incomplete | Initial selected run: 12/14 passed; CORS test assertion corrected. Subsequent foundation tests passed. Landing-to-signup passed targeted rerun. Other reruns encountered Chrome `ERR_INSUFFICIENT_RESOURCES` / VirtualAlloc failure and an API 500 while API became unavailable. Full browser suite is not passed. |
| Live API boundaries | Passed after API restart | Allowed preflight 204; foreign origin 403 with no allow-origin header; anonymous admin mutation 401. |
| SQL integration | Blocked | Disposable local PostgreSQL 127.0.0.1:54322 timed out; generic integration runner skipped all nine tests without required inputs. Hosted database is not substituted for the disposable test database. |
| Semantic evaluation | Blocked | Runner executed zero cases and recorded 15 blocked entries; account configuration absent. No live answer evaluation success claimed. |
| Full recording → reviewed learning | Blocked | No test-account file or expert-confirmed debrief answers supplied. Successful diagnostic transcription is not an end-to-end workflow. |
| External email / staging / rehearsals | Untested | No authorized recipient/inbox observation, staging deployment configuration, or completed workflow rehearsal provided. |

## Next steps

Restart the media worker to load the fixed code. The existing job already carries
a permanent `INVALID_DURATION` failure; its standard bounded retry action excludes
permanent invalid-input errors. Upload the recording as a new capture rather than
changing job rows or bypassing authorization. No existing job was silently reset.

Supply `ALVIS_E2E_ACCOUNTS_FILE`, `ALVIS_LIVE_RECORDING` and
`ALVIS_LIVE_DEBRIEF_FILE` as paths to private, real test inputs. Expert answers must
match the generated questions, not be fabricated. Restore the disposable local
database before SQL tests. External delivery needs an explicitly authorized test
recipient and observation of the received verification/recovery/invitation email.

`release:preflight` can still exit 1 for the missing live-recording configuration;
that does not mean FFmpeg startup failed. Its static email entries do not consume
this report or turn themselves into delivery tests.
