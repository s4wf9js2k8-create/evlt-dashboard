# EVLT save verification

Use Node.js 22 and Java 21 or later. Install function dependencies with `npm ci --prefix functions`.

Run ordinary checks from the repository root:

```
node --test tests/access-persistence.test.mjs tests/availability.test.mjs functions/banner-notifications.test.mjs functions/automatic-banner-notifications.test.mjs
```

Run each `tests/*.test.cjs` file with Node (PowerShell: `Get-ChildItem tests/*.test.cjs | ForEach-Object { node $_.FullName }`).

The integration check starts a local Realtime Database emulator with synthetic records. Its script refuses to run without the exact local emulator address. The open test rules belong only to this disposable demo project, and must never be deployed to a live project.

```
firebase emulators:exec --only database --project demo-evlt-save --config tests/firebase.emulator.json "node tests/access-emulator.integration.mjs"
```

This exercises the actual callable handler with local authenticated request fixtures, separate-connection persistence reads, concurrent role saves, stale-edit rejection, volunteer/profile linking, admin checks, own-availability scoping and cancellation, and loft save conflicts. Production callable token validation is additionally checked by an unsigned request returning 401; the emulator's request auth fixtures do not validate real token signatures.

Operations unit and client checks:

```
node --test tests/operations.test.mjs tests/operations-client.test.mjs
firebase emulators:exec --only database --project demo-evlt-operations --config firebase.operations-test.json "node tests/operations-emulator.integration.mjs"
```

The operations emulator loads the production database rules and synthetic records. It exercises actual callable handlers, booking/event privacy, public request moderation, concurrent checkout, damaged returns, maintenance release gates, current-data reads and restricted page permissions. Microsoft calendar routing and payloads are tested with local mocks; real OAuth consent, Outlook writes and OneDrive access require organisation setup and a connected Microsoft account.
