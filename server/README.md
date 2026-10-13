# Alvis server

The existing Next.js route-handler framework is retained as an API-only application. Default URL: http://127.0.0.1:4000. No frontend pages are served here.

- `src/app/api/`: HTTP routes.
- `src/config/`: environment validation, origin allowlist and cookie options.
- `src/middleware/`: CORS, CSRF origin checks, authenticated request context and navigation responses.
- `src/database/`: Supabase cookie client and authorized organization queries.
- `src/services/`: onboarding/authentication, review transitions, page-data views, storage, email and OpenAI services.
- `src/jobs/`: durable media and indexing/lesson workers, FFmpeg preparation.
- `src/validation/`: shared contract entry points; validation is also enforced in database RPCs.
- `supabase/`: all migrations, local configuration and email templates.
- `scripts/`: explicit environment-loading entry points and maintenance tools.
- `tests/`: unit and PostgreSQL authorization/workflow suites.
- `docs/`: release evidence, deployment and Moonshot demonstration instructions.

Copy `.env.example` to `.env.local` on a new checkout. The refactor moved the existing private configuration here and renamed the provider URL/key to `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. Do not copy backend settings into `client/`.

From the root: `npm run dev:server`, `npm run worker`, `npm run worker:learning`. From here: `npm run dev`, `npm run worker:once`, `npm run worker:learning:once`, `npm run release:preflight`. Launchers explicitly load this application's `.env.local` or the file selected by `ALVIS_ENV_FILE`; worker jobs do not load client configuration. Missing API setup reports variable names without values. Password recovery fails closed when its secret is absent; processing additionally requires the actual configured OpenAI/STT/embedding/S3 settings and FFmpeg.

The [root README](../README.md) defines authentication transport, CORS, installation, testing and deployment. Earlier milestone setup notes are preserved in [history](docs/milestone-setup-history.md); their old single-application paths are historical, not current commands.

Personal/community access is additive. Apply migrations 013–017 after the existing
001–012; existing data remains organization-private. See [architecture and rollback](docs/community-architecture.md),
[permissions](docs/community-permissions.md), and [onboarding](docs/community-onboarding.md).
`npm run test:postgres` executes real SQL suites in the disposable local database
`alvis_community_verified` on 127.0.0.1:54322, without loading hosted credentials.
Override only its local password with `ALVIS_LOCAL_TEST_DB_PASSWORD` when needed.
It uses synthetic auth rows/evidence/vectors; it does not perform live signup or AI processing.
