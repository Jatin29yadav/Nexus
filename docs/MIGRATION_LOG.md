# Nexus API migration log

Every change to the API contract (`docs/API_CONTRACT.md`) gets one entry here. Backend and frontend are separate repos, so each entry is landed as **paired commits** on same-named branches; both commit messages cite the entry id.

| Id | Date | Finding | Endpoint(s) | Change | Backend | Frontend |
|---|---|---|---|---|---|---|
| ML-001 | 2026-11-11 | SEC-02 (contract M-14) | `GET /tournaments`, `GET /tournaments/:tournamentId` | `registeredTeams[]` items are trimmed to `{ _id, teamName, status }` unless the caller is an admin (optional cookie auth; the GETs stay public). Admin responses are unchanged. | `fix/security` — `fix(SEC-02)` | `fix/security` — test mocks follow the new shape. No source change: public pages read only `teamName`, `status` and the count; the admin screen already sends the cookie. |
