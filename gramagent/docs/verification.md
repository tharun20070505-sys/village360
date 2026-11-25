# Verification record

Verified on 24 November 2026 against Village 360 commit `03ef3138d7b1d3af7645b6a35feceb51bd228309` plus this change.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Existing application | Passed | 19 Node tests, including scoped aggregate export, small-cell suppression, consent/roles and source-record preservation |
| GramAgent API/data/workflow | Passed | 12 pytest tests: nulls, denominators, imports, durable approval/resume, tenant restrictions, revoked login, cost/scenario arithmetic, MCDA, RAG freshness bounded AI revision loop and expired-worker lease recovery |
| Existing frontend production build | Passed | Vite build completed |
| GramAgent TypeScript and production build | Passed | Type checking and Vite build completed; charts/map/motion split into separate chunks |
| Browser sign-in/import | Passed | Local administrator signed in through the UI; synthetic baseline loaded and labelled |
| Browser assessment/approval | Passed | Worker produced six findings, paused for review, resumed after synthetic approval, and displayed one approved project |
| Browser console | Passed for inspected flow | No error-level console messages in the inspected test tab |
| Report generation | Passed through API | CSV, XLSX and PDF returned valid content; eight report types tested |
| Browser download automation | Not verified | In-app download-event wait timed out; API exports passed independently |
| Mobile browser automation | Not verified | Standalone Chromium launch blocked by macOS sandbox; in-app viewport override did not alter the test tab. Responsive CSS is included but no passing automated mobile result is claimed |
| Live provider APIs | Not verified | No provider key/model configured; controlled test double exercised AI strategy, evidence preservation and three-pass correction |
| Live Atlas/vector index | Not verified | No Atlas credentials configured; local SQLite checkpoints and TF-IDF retrieval tested |
| Real Village 360 source | Not verified | Adapter tested with an isolated MongoDB replica set and synthetic records; no production source credential provided |
| Docker/cloud deployment | Not verified | Docker executable and deployment credentials unavailable in this workspace |

## Dependency audit

The existing Node dependency tree reports four advisories: `react-router`, `react-router-dom`, `sharp`, and `zod` (two moderate, two high). The audit offered no automatic fixed version for these installed dependency families. No forced major upgrades were applied to the existing application. This remains a production acceptance item. The existing API's request limits reduce the oversized-input exposure but do not constitute a complete remediation claim.

## Release boundaries

This is a runnable implementation for local evaluation and a reviewable development change, not a verified production deployment. Full Tamil form/report translation, a distributed rate limiter, organisational SSO/MFA/password recovery, and a validated overall readiness rubric remain production hardening work. Current source mapping covers six household indicators; other aggregate sectors require file import or additional reviewed mappings.

The application never silently substitutes simulated AI responses for unavailable providers. Unknown budgets, absent scheme evidence and missing measurements remain explicitly unavailable.
