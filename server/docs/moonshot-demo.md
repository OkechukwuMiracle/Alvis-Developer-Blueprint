# Moonshot core demonstration · 5 minutes 30 seconds

This is a presenter plan, not a record of completed rehearsals. Do not mark either rehearsal complete until it actually runs. No fictional customer outcomes or processing timings belong in the presentation.

## Prepare actual accounts and source material

Register an administrator through `/signup`, open the real verification email and create a designated nonproduction demo organization. Add the training assets in Settings. Invite three distinct expert, reviewer and worker addresses; each registers/verifies or signs in with an existing verified account, then accepts the email-bound invitation. Do not create these identities with the legacy seed account script. Use three isolated browser profiles or contexts, with a visible role/workspace header. Store account passwords outside Git and avoid trace recording or password-entry video.

Record a consented supervised training simulation following `alvis-blueprint/data/demo-recording-script.md`. An expert must supply the debrief answers; do not manufacture observations or outcomes. Test microphone permission and upload alternatives. Check real timestamp links and caption text. Keep unresolved unknowns visible. Prepare a completed run from that actual recording with its own approved current revision, completed indexing and **separately reviewer-approved lesson tied to that same revision**. This is the saved-run fallback, never fictional live processing.

## Presenter script

| Time | Screen and action | Words / boundary |
|---|---|---|
| 0:00–0:20 | Public landing, briefly show Get started | “Alvis preserves the judgment behind expert work. People can register themselves, verify their email, and create a workspace or accept an authorized invitation.” |
| 0:20–0:50 | Expert session; select training asset and consent; upload/record | “This is a supervised manufacturing training simulation. We preserve the source, not just a summary.” |
| 0:50–1:25 | Processing/transcript | Show actual stage state and timestamp navigation. State observed timing only if measured. If processing exceeds the rehearsed budget: “This is a saved run of the same actual recording. I’ll show the completed result.” Keep a visible **Saved run** label. |
| 1:25–2:05 | Debrief | Explain the noticed signal, chosen action, reason, exception and observed outcome. “The recording cannot tell us the expert’s reasoning. Missing information stays missing until confirmed.” |
| 2:05–2:40 | Draft sources; reviewer profile; approval | “The generated draft is unverified. This reviewer checks its evidence and applicability before publication.” Approve the exact version with a real review comment; wait for real indexing. |
| 2:40–3:15 | Worker Ask and source inspection | Ask the rehearsed asset-specific query. “This explanation is generated from reviewed sources. Here is its supporting source.” Open an authorized excerpt or actual timestamp. |
| 3:15–3:50 | Supervised guide | Acknowledge prerequisites/simulation, follow the stored reviewed steps, record the actual simulation outcome. “These steps come from reviewed content, not a freshly generated repair sequence.” |
| 3:50–4:35 | Lesson and all three assessment questions | Use a separately approved lesson for the **same active revision as this guide**. If the new revision's lesson is not ready, explicitly switch to the prepared saved run and show its guide/lesson context; never imply automatic human approval. Complete all three questions and submit. “Knowledge check passed describes this assessment, not certification or practical competence.” |
| 4:35–5:00 | Negative Ask example | “Can I bypass the guard?” Show escalation and the absence of repair instructions. |
| 5:00–5:30 | Learning history and close | Show the actual persisted result and revision. “This demonstrates a traceable expert-to-learner transfer. A future pilot would measure answer-finding time and retained learning; those results have not been established here.” |

## Two rehearsals, each from reset

For each rehearsal, reset only the designated demo workspace, prepare a fresh completed fallback and its separately reviewed lesson, then sign in to the three isolated sessions. Confirm the active/indexed revision, authorized sources, private storage, worker connectivity, negative example, mobile layout and durable refresh/relogin state. Run the script with a stopwatch. Record actual capture stage latency, Ask latency/provider usage and any fallback switch. Rehearsal 1 and 2 remain **not run** until recorded in `release-evaluation.md`.

## Demo reset

Set `ALVIS_DEPLOYMENT_ENV=development` or `staging` and the exact `ALVIS_DEMO_ORGANIZATION_ID`. A trusted staging database operator must designate that specific user-created organization with `demo_only=true`; public registration cannot set this flag. Verify project and organization before any update. Set an external `ALVIS_E2E_ACCOUNTS_FILE` with the actual registered `admin` account. From the repository root, run `npm run demo:reset --workspace @alvis/server` to validate and preview, then `npm run demo:reset --workspace @alvis/server -- --execute --confirm <exact-designated-UUID>`.

The database checks administrator membership, exact confirmation and the demo flag. Reset affects only that organization: it retires knowledge, invalidates guides, withdraws evidence, cancels jobs and revokes pending invitations. It preserves users, memberships, assets, historical assessments and audit. It does not physically erase media or create new approved fixtures. Prepare new source material/reviews after reset; label earlier history by its actual dates. Never use `supabase db reset` on a shared or staging project as a demo reset.

## Fallbacks

- **Saved run:** an actual completed recording pipeline with authorized sources, indexing and separate human lesson review. Label the screen and state the switch aloud. No fake timers or processing animation.
- **Recorded demonstration:** a recording of an actually successful application journey. Label it, state that the network is unavailable, and avoid implying offline product functionality. Obtain consent for the demonstration recording; exclude passwords, private links and unrelated people.
- Neither fallback currently exists merely because this script is written. Capture them after the live flow succeeds.
