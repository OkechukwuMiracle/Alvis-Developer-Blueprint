# Alvis specification starter kit
Read product-specification.md first. This kit includes reference PostgreSQL DDL, strict AI output schemas, versioned prompts, fictional manufacturing fixtures, evaluation cases, a demo recording script, draft/answer/lesson examples, a TypeScript API sketch and Codex instructions.

This is a product and implementation specification. It does not include a completed web app, live API credentials, video binaries, embedded vectors or authenticated users.

Run artifact checks with Python 3 (no extra dependency):
python tests/validate_bundle.py

Database DDL targets Supabase PostgreSQL with auth.users, auth.uid() and pgvector. Apply only to a fresh development project after review. Supabase auth account creation, private bucket policies, a fixture seed adapter, publication transactions and job worker code remain implementation tasks described in the specification.

Copy AGENTS.md into the future app repository and begin milestone 1 from the Codex plan. Do not apply demo fixture approvals to real organizational procedures.
