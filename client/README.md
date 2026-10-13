# Alvis client

Next.js pages, components, styles and browser utilities. No database/provider credentials belong here. `src/lib/api-client.ts` is the central browser API transport; `api-server.ts` forwards cookies for server rendering and thin form actions. The API owns all authentication validation, authorization and database operations.

Install once with `npm ci` at the repository root. Copy `.env.example` to `.env.local` and use `npm run dev:client` from the root, or `npm run dev` here. Default URL: http://127.0.0.1:3000. Public configuration is `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SITE_URL` only; these values are compiled into the browser output and require a rebuild when changed.

See the [repository README](../README.md) for cookie/CORS deployment requirements, independent server/worker commands and verification. Local `.env.local` has already been split from the former application configuration; privileged settings were moved to `server/.env.local`.
