# Alvis frontend presentation review

Design reference: [Solra live preview](https://solra.framer.website/) and
[marketplace listing](https://www.framer.com/marketplace/templates/solra/).
The dark public backdrop, centered hierarchy, generous section spacing and
product-card composition informed this update. Alvis keeps its existing wordmark,
green identity, copy, routes and product boundaries. No Solra assets, statistics,
customer logos or testimonials were copied. No dependencies were added.

## Changes

`src/app/design-system.css` defines a shared presentation layer over the existing
Tailwind/base styles. It covers the public page and its existing How it works,
Use cases, About and FAQ sections; login, signup, verification and recovery;
onboarding and invitations; organization and personal dashboards; capture,
processing, debrief and editing; review and sources; Ask, practice, lessons,
history and settings. Cards, notices, native controls, tables, evidence links,
focus rings and reduced-motion states share the same tokens.

The existing shell adds active-route styling and explicit Personal/Private
organization labels. Its role conditions and destinations are preserved. Public
community navigation retains all existing links. The mobile Ask action stays
available in page flow so it cannot obscure form fields or evidence controls.

No backend, schema, authorization, API payload, authentication, environment,
worker, model or business-rule changes were required. Generated TypeScript
includes created by isolated build tools are removed from the final configuration.

## Verification and limits

- Type checking, frontend lint and frontend production builds passed.
- Existing 32 unit tests passed.
- The selected browser suite covers landing/signup navigation, recovery and
  verification states, public community browsing, excerpt inspection and
  contributor profiles, and anonymous/foreign-origin API denial. Its initial run
  passed 22/24; the two failed desktop checks passed on targeted rerun (three
  desktop tests passed). A browser setup timeout and slow navigation occurred
  during memory pressure. No test selectors were changed for this redesign.
- Anonymous landing, signup, login and invitation screenshots/checks at 360,
  768 and 1440 pixels found no page-level horizontal overflow.
- The isolated production review exercises 15 screen types at those widths:
  expert dashboard, capture form, worker Ask, reviewer queue, sources, knowledge,
  learning history, settings, onboarding, draft editing, practice, active guide,
  lesson, debrief and personal dashboard. It checks horizontal overflow, keyboard
  focus and role-dependent navigation. It submits Ask to a synthetic endpoint and
  checks the existing `{ asset_id, query }` payload and abstention presentation.
- Production review identities, memberships, records and responses are explicit
  test fixtures. These checks are not live signup, model generation, authorization
  proof or real authenticated end-to-end workflow verification. Initial lesson
  fixture questions have answer keys removed.
- No new live email/signup, invitation acceptance, workspace switch transaction,
  recording upload/processing, draft submission, publication, positive model Ask,
  guide completion or scored assessment was performed in this presentation task.
  Those integrations remain subject to their existing configuration and tests.

## Reviewing locally

Run `npm run dev` from the repository root and visit `http://127.0.0.1:3000`.
Use your real accounts to inspect personal and organization contexts.

The local `client/test-results/ui-review/index.html` gallery contains public/auth
and fixture workspace comparisons. Baselines remove the new stylesheet in the
browser to show the previous base styling, while retaining the same data and
markup. Workspace baselines retain the new context label and active-link markup;
they compare styling rather than historical account data. The initial public
before-edit captures were replaced when Playwright cleared its output folder, so
the gallery regenerates the previous base styling instead.
Long workspace pages use viewport captures to avoid oversized screenshot buffers.
Generated screenshots, builds and test artifacts remain ignored by Git.

To regenerate the isolated workspace review from `client/`:

```powershell
$env:ALVIS_NEXT_DIST_DIR='.next-ui-build'
npm run build
$env:ALVIS_UI_BUILD_DIR='.next-ui-build'
node tests/ui-review.mjs
```

This test uses ports 3200/4200 and stops only its own preview process. Its fetch
preload is loaded explicitly by the test runner and is never imported by the
application. It keeps test API fixtures separate from the real server on 4000.
The first development-preview attempts hit compilation/memory failures; the
production preview completed the layout review. Close unnecessary processes if
the machine cannot allocate sufficient memory for Next.js and Chromium together.
