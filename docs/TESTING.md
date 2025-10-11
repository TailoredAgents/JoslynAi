## Testing Guide

This repository has three primary test surfaces:

1. **API unit tests (Vitest)**
   ```bash
   pnpm --filter @joslyn-ai/api test
   ```
   - Exercises Fastify routes such as document upload validation.
   - Requires no running services; mocks provide dependencies.

2. **Worker unit tests (Pytest)**
   ```bash
   python -m pytest services/worker/tests
   ```
   - Covers retry/dead-letter orchestration and safety phrase fallbacks.
   - The tests stub external dependencies (`redis`, `psycopg`, `openai`) so no services need to be running.

3. **End-to-end tests (Playwright)**
   ```bash
   pnpm dlx playwright test -c e2e
   ```
   - Requires the local stack (`make up`) with API, Web, Worker, and ClamAV running.
   - Includes negative upload coverage (`e2e/tests/upload-negative.spec.ts`) to assert disallowed formats are rejected.

### CI Coverage

- `.github/workflows/ci.yml` runs typechecking/builds and executes the API Vitest suite.
- Add the following commands to a separate job or step to exercise the worker and Playwright suites as part of Release readiness:
  ```bash
  python -m pytest services/worker/tests
  pnpm dlx playwright test -c e2e
  ```
