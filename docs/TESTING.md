# Testing policy

At the owner's direction, this repository contains **no automated tests**. All unit, integration, RPC, compiler-fixture, native, and live-probe suites and their fixtures/runners were removed. Do not add or regenerate tests.

The former pass counts and test results referenced in historical planning documents are no longer reproducible and must not be used as current acceptance or release evidence. No test-dependent acceptance row is certified.

The only retained development commands are:

```bash
npm run typecheck
npm run pack:check
```

These are not behavioral tests. `typecheck` is a static compiler check and remains an open failing gate. `pack:check` is only an npm package dry run and does not load or qualify the extension.

Without tests, changes require manual review and carry unmeasured regression risk. The package must not be represented as release-qualified, natively certified, or safe for unattended work.
