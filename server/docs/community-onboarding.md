# Personal and organization onboarding

1. Open `/signup`, select Personal account or Create an organization, and register
   with name, email and matching passwords. There is one identity per person.
2. Open the verification email and confirm the link. Email verification is required
   for activation, organization creation and invitations. Existing recovery flows apply.
3. At `/onboarding`, activate a Personal profile with a public display name and
   Expert, Community Reviewer, or Worker/Learner role. No company or invitation is needed.
   Roles do not verify professional credentials. All personal roles can discover, ask and learn.
4. Alternatively create an empty private organization as its admin or accept an
   authorized, email-bound invitation at `/invite`. Signup cannot select an existing
   organization's ID or assign an organization role.
5. Use Workspace selection to open Personal or an authorized organization. The
   active context is displayed in navigation. A personal user may later create or
   join an organization; an existing member may activate Personal using the same account.

Personal experts record under their private scope and describe the subject/tool/task.
After transcript review, debrief and draft editing, save the complete draft. Preview
the content and select exact supporting text excerpts. Confirm authorization to share
and assigned-reviewer access before submitting to the community queue. Raw recordings
stay private. A different eligible reviewer claims and decides the pinned version;
approved content becomes public only after durable indexing succeeds.

Contributors see decisions in Personal home. Corrections create a new draft revision
and require fresh explicit sharing and review. Withdrawal removes discovery/Ask access
and invalidates affected guides. Lessons need a separate reviewer decision before use.
Organization contributions keep their existing private queues and publication process.

Configuration uses existing Supabase, SMTP, storage and model settings. There are no
new browser secrets or public role-switch credentials. Missing migrations require
013–017 after 001–012; missing email delivery still requires provider SMTP setup.
Locally intercepted verification emails are test delivery, not successful external delivery.
