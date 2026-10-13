# Personal/community extension: additive migration plan

Existing organization IDs, memberships, content and review history remain intact.
Migration 013 marks existing storage scopes `organization`, creates owner-only
`personal` scopes on demand, and stores community roles in `community_profiles`.
The original scope IDs/FKs are retained so durable media/extraction/indexing jobs
do not need a second implementation. A personal scope's internal owner membership
is infrastructure, not membership in an organization; it is excluded from the
organization selector and invitations. Community reviewer status never adds a
membership to another person's scope or a private organization.

Captures, revisions and sources carry explicit audiences, backfilled as
`organization_private`; personal scope inserts become `personal_private`.
No private base record becomes public. `community_publications` is a separate,
explicitly shared projection of content plus contributor-selected text excerpts.
It contains no storage keys or raw recording URLs. Reviewers see only submitted
queue metadata, claim an assignment before inspecting submitted excerpts, and cannot review their own content. Approval
validates the pinned content hash, complete schema and actual same-scope evidence.
Public access additionally requires approved state, active revision and completed
indexing. Existing indexing jobs process the private approved revision; public
search intersects chunks with the explicit publication projection before ranking.

Personal Ask and learning use their own context, persistence and public-only
retrieval. Organization routes do not mix public candidates into answers. A
retirement trigger withdraws publications and invalidates public guides. Original
organization publication is wrapped to reject personal publication without an
explicit community submission. Public lesson answer keys are returned only by a
reviewer RPC or after server-scored assessment.

Apply migrations 013–017 after 001–012, in filename order. Migration 013 adds scopes,
audiences, projections and review; 014 adds hybrid retrieval and learning; 015 adds
review feedback and updates the permission audit; 016 preserves later organization
creation and the original publication function; 017 restricts evidence to assigned
reviewers, reserves question capacity before provider calls, and hardens answer RPCs.
No seeded accounts or public role switcher is
required. Leave additive tables and access policies in place when rolling back.
Use a compatibility application build that retains the workspace scope filter and
disables community entry points if needed. An unmodified pre-extension application
would mistake internal personal memberships for organizations; an old lesson worker
would not restrict public authoring to selected excerpts. Do not roll those images
back over personal records/jobs. Retain the current worker implementation or stop
workers until a compatible image is available. Restore organization UI behavior
with its existing scope checks; never reverse audiences or delete personal scope
records while jobs run. Before destructive schema rollback, export the new records
and review all dependencies with workers stopped.
Community reviewed means peer review, not verified credentials, certification,
organization approval or guaranteed correctness.
