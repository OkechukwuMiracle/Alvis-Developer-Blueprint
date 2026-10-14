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

## Windows media-worker setup

`npm ffmpeg -version` and `npm ffprobe -version` report npm's version; they do not
verify media executables. Download and extract a Windows FFmpeg build linked from
[FFmpeg's download page](https://ffmpeg.org/download.html). Set both absolute
executable paths in the ignored `server/.env.local`, using your actual extracted
directory (not the archive or its enclosing directory):

```dotenv
FFMPEG_PATH="C:/path/to/ffmpeg/bin/ffmpeg.exe"
FFPROBE_PATH="C:/path/to/ffmpeg/bin/ffprobe.exe"
```

From the repository root, run `npm run media:check --workspace @alvis/server`.
This probes the real binaries, generates two seconds of synthetic video/audio,
and runs the worker's media validation and WAV preparation. It cleans its
temporary files. It does not test storage, transcription, extraction or an
expert-confirmed recording. Then run `npm run worker`. Explicit paths require no
PATH change; after changing PATH instead, restart your terminal and IDE.

`release:preflight` intentionally returns a nonzero exit code while any item is
blocked, even if the worker itself is ready. Its email and live-recording entries
are setup checks, not a stored record of completed inbox or workflow tests.

Personal/community access is additive. Apply migrations 013–017 after the existing
001–012; existing data remains organization-private. See [architecture and rollback](docs/community-architecture.md),
[permissions](docs/community-permissions.md), and [onboarding](docs/community-onboarding.md).
`npm run test:postgres` executes real SQL suites in the disposable local database
`alvis_community_verified` on 127.0.0.1:54322, without loading hosted credentials.
Override only its local password with `ALVIS_LOCAL_TEST_DB_PASSWORD` when needed.
It uses synthetic auth rows/evidence/vectors; it does not perform live signup or AI processing.
