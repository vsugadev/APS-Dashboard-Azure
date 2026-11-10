# gas-source — Apps Script reference copy (read-only)

A snapshot of the live Google Apps Script project (`APS-Classroom-Dashboard`, release r121 — see `SNAPSHOT.json`),
kept here so the Azure migration can read, port and test against the exact code in production.

- **Do not edit these files here.** Changes to the live dashboard are made in `APS-Classroom-Dashboard`, then
  copied here with `npm run sync-gas` (it also updates `SNAPSHOT.json`).
- `test/` is the Apps Script regression suite (119 scripts + fixtures). Run it with `npm run test:gas`; each Azure
  module is ported when its suites pass against the Azure code too.
- Secret files (`ENV_VARIABLE_*.gs`) are never copied into this project.
