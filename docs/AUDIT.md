# Nexus — Phase 1 Audit

- **Date:** 2026-11-11
- **Scope:** backend `Nexus/` (commit `524f698`, branch `chore/audit`) and frontend `nexus-frontend/` (commit `8d178c2`).
- **Method:** static read of every source file, `npm audit --package-lock-only` in both packages, pattern scan of the full git history of both repos. Read-only: no source file was changed.
- **Not done / limits:**
  - Nothing was executed against a database and no dependencies were installed, so findings marked *(not runtime-verified)* are from reading code only.
  - `.env` values were not read (project rule), so the strength of `JWT_SECRET` and the contents of `MONGO_URI` are **unverified**.
  - Bundle size was not measured (no build was run).
- Paths are relative to the workspace root: `Nexus/…` is the backend repo, `nexus-frontend/…` the frontend repo.
- Frontend fixes are constrained by the **UI freeze**: only logic may change. Where a fix would touch markup, text or assets it is flagged **(needs UI decision)**.

## Summary

| Area | Critical | High | Medium | Low |
|---|---|---|---|---|
| Security (SEC) | 0 | 7 | 10 | 5 |
| Code quality (QUAL) | 0 | 3 | 7 | 4 |
| Performance (PERF) | 0 | 0 | 5 | 4 |
| Deployment (DEP) | 1 | 3 | 4 | 2 |
| Tests (TEST) | 0 | 1 | 0 | 0 |

Checked with **no finding**: secrets in code or git history (none; `.env` was never committed in either repo), SQL injection (no SQL), command injection (no `child_process`/`eval`), user-controlled regular expressions (none), XSS sinks (`dangerouslySetInnerHTML`/`innerHTML`: none; React escapes all rendered API data), file uploads (none exist), stack traces in responses (none are sent), tokens in `localStorage` (none; only `sessionStorage.nexus_booted`), `target="_blank"` without `rel` (both uses have `noopener noreferrer`).

---

## 1. Security

### SEC-01 — Any logged-in user can list every booking, including other customers' name, email and phone
- **Where:** `Nexus/controllers/booking.js:72-74`, route `Nexus/routes/booking.js:16`; shown to non-admins at `nexus-frontend/src/pages/BookingList.jsx:31,117`
- **Severity:** High
- **Why:** `Booking.find()` has no filter. Broken access control (OWASP A01): user A reads user B's personal data. The frontend renders all of them and only hides the edit/cancel buttons.
- **Fix:** Filter by `user: req.user._id` unless `req.user.role === "Admin"`. Keep the response key `bookings` so the frontend needs no change.

### SEC-02 — Public tournament endpoints expose players' phone numbers
- **Where:** `Nexus/controllers/tournament.js:26,42` (routes `Nexus/routes/tournament.js:14-15`, no auth)
- **Severity:** High
- **Why:** Both return the full document including `registeredTeams[].players[]` with `name`, `inGameId`, `phone`, plus `captain` user ids. Anyone on the internet can harvest them.
- **Fix:** For non-admin callers, project teams down to what the public UI reads (`teamName`, `status`, count). Serve full rosters only to admins (the admin screen `AdminBookings.jsx` needs them). This is a contract change — see API_CONTRACT.md M-14.

### SEC-03 — Booking creation trusts the client for stations, price and times; no availability check
- **Where:** `Nexus/controllers/booking.js:7-56`
- **Severity:** High
- **Why:** No validation at all. A user can: set `totalAmount` to anything; send any `stations` (already occupied, under maintenance, non-existent, or all 60 at once) and the code marks them `Occupied` (`:47-56`); omit `bookingTime` and get a 500. There is no check that a station is free and no atomicity, so two requests double-book. The Zod `bookingSchema` exists (`Nexus/validations/zodSchemas.js:3`) but is not used and does not cover `stations`.
- **Fix:** Validate with Zod (extend the schema with `stations`), verify every station exists and is `Available` for the requested window, compute `totalAmount` on the server, and claim stations atomically (`updateMany` with `status: "Available"` in the filter and check `modifiedCount`, or a transaction).

### SEC-04 — NoSQL operator injection on login and register
- **Where:** `Nexus/controllers/user.js:8,40-42`; also `stations` at `Nexus/controllers/booking.js:48`
- **Severity:** High
- **Why:** `email` from the JSON body goes straight into `findOne({ email })`. Sending `{"email": {"$ne": null}, "password": "x"}` matches the first user, so an attacker can try passwords without knowing an email, and the bcrypt delay (present only when a user matched) is a timing oracle for `{"$regex": …}` enumeration. A non-string `password` makes bcrypt throw.
- **Fix:** Zod-validate that `email`/`password` are strings before querying; set `mongoose.set("sanitizeFilter", true)`; upgrade Mongoose first (SEC-19 — the installed range has advisories about `sanitizeFilter` not being applied).

### SEC-05 — Cross-site request forgery is possible on POST routes
- **Where:** `Nexus/app.js:23` (`express.urlencoded`), cookie set with `sameSite: "none"` at `Nexus/controllers/user.js:23-27,64-68`
- **Severity:** High
- **Why:** The auth cookie is sent on cross-site requests, and the server accepts form-encoded bodies, which browsers send without a CORS preflight. A malicious page can auto-submit a form to `POST /api/bookings`, `POST /api/tournaments/:id/register`, `POST /api/tournaments` (as an admin) or `POST /api/users/logout`. CORS stops the attacker reading the reply, not the action. PUT/DELETE are protected by preflight.
- **Fix:** Remove `express.urlencoded` (the frontend only sends JSON) and reject non-JSON content types; add an `Origin` allow-list check on state-changing requests. Better: make the API same-site (DEP-04) and switch the cookie to `SameSite=Lax`.

### SEC-06 — No rate limiting on login, register or the public contact form
- **Where:** `Nexus/routes/user.js:7-8`, `Nexus/routes/message.js:6`, `Nexus/app.js` (none configured)
- **Severity:** High
- **Why:** Unlimited password guessing and account creation; `POST /api/messages` is unauthenticated and writes to the database, so it can be spammed until storage fills. bcryptjs runs on the main thread, so a login flood also stalls the whole API (PERF-06).
- **Fix:** Add a rate limiter (per IP, stricter on auth routes) and `app.set("trust proxy", 1)` so the real client IP is used behind Render. Adding the limiter package needs approval (dependency rule).

### SEC-07 — Known-vulnerable dependencies (`npm audit`)
- **Where:** `Nexus/package-lock.json`, `nexus-frontend/package-lock.json`
- **Severity:** High
- **Why / result:**

  | Package | Backend | Frontend | Severity | Runtime-relevant? |
  |---|---|---|---|---|
  | `mongoose` 8.0.0–8.24.6 | yes | – | Critical | Yes — `sanitizeFilter` bypasses, prototype pollution |
  | `proxy-addr` ≤2.0.7 | yes | – | Critical | Yes once `trust proxy` is enabled (IP spoofing) |
  | `body-parser` 2.0.0–2.3.0 | yes | – | High | Yes — DoS on request bodies |
  | `zod` <4.6.6 | yes | yes | High | Yes once validation is wired — memory exhaustion |
  | `axios` 1.0.0–1.19.0 | yes | – | High | No — unused on the backend; remove it |
  | `follow-redirects` 1.16.0–1.16.1 | yes | yes | High | Via axios (Node only) |
  | `brace-expansion`, `minimatch`, `nodemon` | yes | – | High / Moderate | Dev tooling only |
  | `qs` 6.7.0–6.16.0 | yes | – | Moderate | Low |
  | `vite` 8.0.0–8.1.5 | – | yes | High | Dev server only |
  | `source-map-js` 1.0.0–1.2.1 | – | yes | High | Build tooling only |

  Totals: backend **10** (2 critical, 5 high, 3 moderate); frontend **4** (4 high). npm reports all are fixable with `npm audit fix` (no breaking upgrades).
- **Fix:** Run `npm audit fix` in each package on its own commit, re-run the audit, and drop unused packages (QUAL-01, QUAL-02).

### SEC-08 — No security headers
- **Where:** `Nexus/app.js` (no `helmet`; `X-Powered-By: Express` is sent)
- **Severity:** Medium
- **Why:** Missing `X-Content-Type-Options`, HSTS, frame protection etc. Lower impact for a JSON-only API but expected baseline.
- **Fix:** Add `helmet` (needs dependency approval) or at minimum `app.disable("x-powered-by")` and set the headers by hand. The frontend's headers are set by Vercel; a CSP there would be a `vercel.json` change.

### SEC-09 — JWT has no revocation or refresh, and logout does not invalidate it
- **Where:** `Nexus/controllers/user.js:19-21,60-62,82-88`; `Nexus/middleware.js:14`
- **Severity:** Medium
- **Why:** A token stays valid for 7 days after logout or password compromise; logout only clears the browser cookie. There is no refresh flow. `jwt.verify` does not pin `algorithms` (jsonwebtoken 9 defaults to HMAC for a string secret, so this is hardening, not an exploit). Verification itself is present on every protected route (see API_CONTRACT.md §1).
- **Fix:** Shorter access token (e.g. 15–60 min) with a refresh token, or keep 7 days and add a `tokenVersion` on the user that is checked in `isLoggedIn` and bumped on logout/password change (schema change — needs approval). Pass `{ algorithms: ["HS256"] }` to `verify`.

### SEC-10 — `JWT_SECRET` strength is unverified and its absence is not detected at boot
- **Where:** `Nexus/server.js:6-7`, used at `Nexus/controllers/user.js:19,60`, `Nexus/middleware.js:14`
- **Severity:** Medium
- **Why:** The value was not read. If it is short or guessable, tokens can be forged for any user including admins. If it is missing, the server still starts and every register returns the internal jsonwebtoken error text.
- **Fix:** The owner should confirm it is at least 32 random bytes and generate a **new** one for the new Render service (the old service is lost, so treat the old secret as exposed). Fail fast at startup when `JWT_SECRET`, `MONGO_URI` or `CLIENT_URL` is missing.

### SEC-11 — No password policy or input validation on register
- **Where:** `Nexus/controllers/user.js:6-17`, `Nexus/models/User.js:6-24`
- **Severity:** Medium
- **Why:** A one-character password is accepted; `email` format, `username` and `phone` are unchecked. Hashing itself is sound (bcryptjs, cost 10, `Nexus/models/User.js:56-62`; `password` is `select: false`).
- **Fix:** Zod schema: email format, password minimum length (≥ 8–10), username/phone shape. Consider cost 12.

### SEC-12 — Register returns raw internal error messages; reveals whether an email exists
- **Where:** `Nexus/controllers/user.js:10-15,33-35`
- **Severity:** Medium
- **Why:** `error.message` is returned verbatim, so a duplicate username returns the MongoDB `E11000 duplicate key … index: username_1 dup key: {…}` text, and schema validation text leaks too. The 422 "User already exists" confirms registered emails.
- **Fix:** Map known errors to fixed messages (duplicate email/username → 409 or 422 with a generic message) and log the original server-side.

### SEC-13 — Cookie flags depend on `NODE_ENV`; no lifetime set
- **Where:** `Nexus/controllers/user.js:23-27,64-68,83-88`
- **Severity:** Medium
- **Why:** `httpOnly` is set (good). `secure` is only true when `NODE_ENV === "production"`; with `SameSite=None` and no `Secure`, browsers reject the cookie, so a mis-set `NODE_ENV` breaks login entirely, and local dev over http is unreliable. No `maxAge`, so it is a session cookie while the JWT lasts 7 days. The logout cookie hard-codes `secure: true`, so its attributes differ from the login cookie.
- **Fix:** One shared cookie-options helper used by login, register and logout; add `maxAge` equal to the token lifetime; in development use `SameSite=Lax` without `Secure`.

### SEC-14 — CORS always allows `http://localhost:5173` with credentials, and tolerates an unset `CLIENT_URL`
- **Where:** `Nexus/app.js:15-20`
- **Severity:** Medium
- **Why:** In production, any page served from a visitor's own `localhost:5173` may make credentialed calls. If `CLIENT_URL` is unset the list contains `undefined` and the real frontend is silently blocked.
- **Fix:** Build the origin list from env; include localhost only when `NODE_ENV !== "production"`; fail at boot if `CLIENT_URL` is missing.

### SEC-15 — Seed scripts wipe collections and plant accounts with known passwords
- **Where:** `Nexus/init/index.js:25`, `Nexus/init/data.js:4-85`, `Nexus/seedStations.js:13`, `Nexus/init/setupData.js:17`
- **Severity:** Medium
- **Why:** `init/index.js` deletes **all users** in whatever database `MONGO_URI` points to, then creates ten accounts whose passwords are in the public repo. If this was ever run against the production database those accounts are takeover-ready. `seedStations.js` deletes all stations (and so clears live occupancy).
- **Fix:** Guard seeds to refuse to run when `NODE_ENV === "production"` unless an explicit flag is passed; make the station seed an upsert; remove sample users or generate random passwords. The owner should check the production DB for the ten sample emails.

### SEC-16 — `.env.test` is not git-ignored in either repo
- **Where:** `Nexus/.gitignore:2-7` (`*.env` does not match `.env.test`), `nexus-frontend/.gitignore:26`
- **Severity:** Medium
- **Why:** Both files are currently untracked; a routine `git add .` would publish them to public GitHub repos. The backend one contains `MONGO_URI`, `JWT_SECRET` and `SECRET_KEY` entries.
- **Fix:** Add `.env*` with a `!.env.example` exception to both `.gitignore` files and commit a value-free `.env.example`.

### SEC-17 — Owner check on "get one booking" is wrong; tournament updates skip validation
- **Where:** `Nexus/controllers/booking.js:83-97`; `Nexus/controllers/tournament.js:197-214`
- **Severity:** Medium
- **Why:** `booking.user` is populated before `booking.user.toString()` is compared with the user id, so the comparison is against a stringified document and never matches *(not runtime-verified)*: owners get 403 on their own booking, which breaks the edit page (`nexus-frontend/src/components/UpdateBooking.jsx:65`). It fails closed, so it is not a data leak. The update and delete checks (`:110-115`, `:140-145`) do not populate and are correct — user A cannot edit or delete user B's booking. `findByIdAndUpdate` on tournaments runs without `runValidators`, so an invalid `status` or dates are stored.
- **Fix:** Compare `booking.user._id` (or check before populating); extract one `assertOwnerOrAdmin` helper; add `runValidators: true` plus Zod on tournament update.

### SEC-18 — Team registration ignores tournament state and can race past `maxTeams`
- **Where:** `Nexus/controllers/tournament.js:56-90`
- **Severity:** Low
- **Why:** Registration is accepted for `Completed`/`Cancelled` tournaments; the capacity and duplicate checks are read-then-write, so concurrent requests can exceed `maxTeams` or register one captain twice. `teamRegistrationSchema` (`Nexus/validations/zodSchemas.js:33`) is unused.
- **Fix:** Check `status`, validate with Zod, and push with a conditional atomic update.

### SEC-19 — Payment page collects card number and CVV and logs them to the console
- **Where:** `nexus-frontend/src/pages/Payment.jsx:10-16,37-40`
- **Severity:** Low (nothing is transmitted) — would be High if this page were ever wired to a backend
- **Why:** A realistic card form on a live site invites users to type real card data, which is then written to the browser console. Card data must never be handled by this app directly.
- **Fix:** Remove the `console.log` (logic-only change). Whether the page stays reachable is a product/UI decision **(needs UI decision)**; a real payment flow must use a provider-hosted form.

### SEC-20 — Admin area is only login-gated on the client
- **Where:** `nexus-frontend/src/App.jsx:160-168`, `nexus-frontend/src/components/ProtectedRoute.jsx:19`
- **Severity:** Low
- **Why:** Any logged-in user can open `/admin/*` and see the shell and the hard-coded sample users in `AdminUsers.jsx:7-30`. Real data stays protected because the server enforces `isAdmin` on every admin endpoint.
- **Fix:** Add a role check to the route guard (redirect non-admins; logic-only if it reuses the existing redirect).

### SEC-21 — Invalid ids and bad enum values produce 500 instead of 400
- **Where:** every `findById(req.params…)`, e.g. `Nexus/controllers/booking.js:83,106,136`, `Nexus/controllers/admin.js:35,42-43,60`, `Nexus/controllers/tournament.js:26,114,140-142`, `Nexus/controllers/message.js:44,67`
- **Severity:** Low
- **Why:** Malformed ObjectIds throw `CastError`; invalid `status` values throw validation errors; all are caught and reported as server errors, hiding real failures and confusing clients.
- **Fix:** A `validateObjectId` param middleware and Zod enums; return 400.

### SEC-22 — Public station list exposes internal ids
- **Where:** `Nexus/controllers/station.js:5-7`
- **Severity:** Low
- **Why:** Returns `assignedUser` (user ObjectId) and the active booking's id and times to unauthenticated callers. The frontend reads only `stationId`, `type`, `status`, `_id`.
- **Fix:** Project to the fields the UI uses (keep booking times only if a future feature needs them).

---

## 2. Code quality

### QUAL-01 — Backend dead code and unused dependencies
- **Where:** `Nexus/services/booking.service.js:1-207` (queries `setupIds`, which the Booking model does not have), `Nexus/models/Setup.js`, `Nexus/init/setupData.js`, `Nexus/validations/zodSchemas.js` (never imported), `Nexus/utils/wrapAsync.js` (never imported); `Nexus/package.json:16-34` — `passport`, `passport-local`, `passport-local-mongoose`, `express-session`, `connect-flash`, `ejs`, `ejs-mate`, `express-ejs-layouts`, `method-override`, `axios` are never required; `nodemon` is a runtime dependency; `"main": "script.js"` (`:5`) does not exist; `SECRET_KEY` env var is unused.
- **Severity:** Medium
- **Why:** Misleads readers (two competing booking designs), enlarges the install and the vulnerability surface (SEC-07).
- **Fix:** Wire the Zod schemas in; delete the Setup-era files and unused packages (file deletion and dependency changes need approval); move `nodemon` to `devDependencies`.

### QUAL-02 — Frontend dead code and unused dependencies
- **Where:** `nexus-frontend/src/components/TournamentRegisterForm.jsx` (never imported; its payload does not match the API), `nexus-frontend/src/components/Toast.jsx` (never imported), `nexus-frontend/package.json:13,27` — `@clerk/clerk-react`, `swiper` never imported; `nexus-frontend/README.md:38-44` describes a Create-React-App setup (`REACT_APP_API_URL`, `npm start`) that does not exist.
- **Severity:** Low
- **Fix:** Remove after approval (deleting files/deps is gated); correct the README.

### QUAL-03 — Stations are never released when a booking ends; "Completed" is never set
- **Where:** `Nexus/controllers/booking.js:47-56` (only `cancelBooking` `:118-123` and `adminCancelBooking` `Nexus/controllers/admin.js:77-82` free stations); `Nexus/models/Booking.js:37`
- **Severity:** High
- **Why:** A station stays `Occupied` forever after its time slot passes unless someone cancels the booking. Availability is a single global flag, not time-based, so a booking for tomorrow blocks the station today. The cafe's core flow degrades to "everything is occupied".
- **Fix:** Derive availability from bookings overlapping the requested time window instead of a stored flag, or run a periodic job that completes expired bookings and frees stations. Either is a design decision for the revamp.

### QUAL-04 — Errors are swallowed: every controller returns a generic 500 and most log nothing
- **Where:** e.g. `Nexus/controllers/booking.js:63-67,76-78,99-101,129-131,156-158`, `Nexus/controllers/admin.js:23-27,50-54,88-92`, `Nexus/controllers/user.js:74-79,109-113,143-147`, `Nexus/controllers/tournament.js:17-21,33-37,44-48,101-105,174-178`, `Nexus/controllers/station.js:10-14`
- **Severity:** High
- **Why:** Validation errors, bad ids and real outages are indistinguishable, and production failures leave no trace in Render logs. The central handler (`Nexus/app.js:37-43`), `ExpressError` and `wrapAsync` already exist but are bypassed.
- **Fix:** Throw typed errors, wrap handlers with `wrapAsync`, and let one error middleware map error types to status codes and log with a request id.

### QUAL-05 — Server starts listening before (and regardless of) the database connection
- **Where:** `Nexus/server.js:9-20`
- **Severity:** High
- **Why:** If MongoDB is unreachable the process stays up, Render sees it as healthy, and every request hangs for the Mongoose buffer timeout and then returns 500. There is no `SIGTERM` handling for Render restarts and no `unhandledRejection` handler. `Nexus/seedStations.js:7-12` likewise starts seeding without awaiting the connection.
- **Fix:** `await mongoose.connect()` then `listen`; exit non-zero on failure; close the server and connection on `SIGTERM`; add `GET /api/health`.

### QUAL-06 — Inconsistent response shapes and status codes
- **Where:** payload key varies per endpoint: `user`, `booking`, `bookings`, `tournament`, `tournaments`, `team`, `station`, `stations`, `messages`, `wishlist`, and `data` (`Nexus/controllers/admin.js:15`, `Nexus/controllers/message.js:57`); duplicate email → 422 (`Nexus/controllers/user.js:11`) while other bad input → 400 or 500; a user "cancel" hard-deletes the booking (`Nexus/controllers/booking.js:125`) while the admin cancel soft-cancels (`Nexus/controllers/admin.js:74`); rejecting a team deletes it although `"Rejected"` is a valid status (`Nexus/controllers/tournament.js:129-138`).
- **Severity:** Medium
- **Why:** The frontend must special-case each call (`nexus-frontend/src/pages/admin/AdminMessages.jsx:32` guesses between `messages` and `data`). History is lost on delete.
- **Fix:** Fix the envelope in API_CONTRACT.md and migrate endpoint by endpoint; because the UI is frozen, keep existing keys the frontend reads and only add/normalise around them.

### QUAL-07 — Duplicated logic
- **Where:**
  - Backend: token signing + cookie options ×2 and a third variant for logout (`Nexus/controllers/user.js:19-27,60-68,83-88`); owner-or-admin check ×3 (`Nexus/controllers/booking.js:90-93,110-113,140-143`); station release ×2 (`Nexus/controllers/booking.js:118-123`, `Nexus/controllers/admin.js:77-82`).
  - Frontend: four separate HTTP setups (`nexus-frontend/src/hooks/useApi.js:7-12`, `nexus-frontend/src/context/AuthContext.jsx:9-10`, `nexus-frontend/src/pages/Profile.jsx:31-34`, `nexus-frontend/src/pages/Contact.jsx:38-41`); two logout implementations (`nexus-frontend/src/context/AuthContext.jsx:43-55`, `nexus-frontend/src/components/Layout.jsx:17-24`); date/time → ISO conversion ×4 (`nexus-frontend/src/pages/Booking.jsx:59-77`, `nexus-frontend/src/components/UpdateBooking.jsx:111-123`, `nexus-frontend/src/pages/Tournament.jsx:83-89`, `nexus-frontend/src/pages/TournamentDetails.jsx:103-109`); day/time-slot generators ×2 (`Tournament.jsx:42-55`, `TournamentDetails.jsx:40-52`); price formula ×2 (`nexus-frontend/src/components/HUDTimePicker.jsx:73`, `UpdateBooking.jsx:128`).
- **Severity:** Medium
- **Fix:** Backend helpers (`issueAuthCookie`, `assertOwnerOrAdmin`, `releaseStations`). Frontend: one API module with one axios instance and named functions per endpoint, one `logout`, one date utility — all logic-only.

### QUAL-08 — `useApi` adds a new response interceptor on every render
- **Where:** `nexus-frontend/src/hooks/useApi.js:15-23`
- **Severity:** Medium
- **Why:** The axios instance is memoised but `interceptors.response.use` runs in the hook body, so interceptors pile up for the life of each component (a slow leak, and each 401 is logged N times). Every component also creates its own instance.
- **Fix:** Create a single module-level axios instance with its interceptor registered once; keep `useApi` as a thin wrapper returning it so call sites don't change.

### QUAL-09 — Frontend logic defects in request building
- **Where:**
  - `nexus-frontend/src/pages/Booking.jsx:66-68` — month lookup only knows April and May; any other month gives an invalid date and the request fails.
  - `nexus-frontend/src/components/UpdateBooking.jsx:85-88,113` — a booking on any other day is shown, and re-saved, as "Tomorrow".
  - `nexus-frontend/src/components/UpdateBooking.jsx:133-134` and `nexus-frontend/src/pages/TournamentDetails.jsx:91-92,119-120` — the server's error message is ignored.
  - `nexus-frontend/src/pages/TournamentDetails.jsx:111-114` — sends UI-only fields (`selectedDate`, `startTime`, `endTime`) to the API.
  - `nexus-frontend/src/components/TournamentRegistrationModal.jsx:55`, `nexus-frontend/src/pages/BookingList.jsx:44` — effect dependency lists are incomplete; `nexus-frontend/src/pages/Tournament.jsx:36` keeps a `Date` in state used across days.
- **Severity:** Medium
- **Fix:** Move conversions into a tested date utility; send only contract fields. Changing which toast text appears on error is user-visible text **(needs UI decision)**.

### QUAL-10 — Session state can go stale: login response lacks `role`; logout bypasses context
- **Where:** `Nexus/controllers/user.js:70-73` vs `nexus-frontend/src/context/AuthContext.jsx:39`; `nexus-frontend/src/components/Layout.jsx:14,17-24`
- **Severity:** Medium
- **Why:** After login `user` has only `_id`, `email`, `username`, so admin controls stay hidden and `phone` is empty until a full page reload refetches the profile. Layout's logout uses a hard redirect instead of `AuthContext.logout`; if the request fails the user stays "logged in" with only a console message.
- **Fix:** Return the same user shape from login/register as from the profile endpoint (contract change M-05), or refetch the profile after login; route all logout through the context.

### QUAL-11 — Data model drift
- **Where:** `Nexus/models/User.js:42-47` (`bookings` is never written) and `Nexus/controllers/user.js:97-100` (populates `bookings.assignedStation`, a path that is not in the Booking schema — will throw `StrictPopulateError` as soon as `bookings` is non-empty *(not runtime-verified)*, which would break session restore for that user); `Nexus/models/Tournament.js:45-47` (`rules` default is declared on the element, not the array); `Nexus/models/Tournament.js:3-7` (no `email` on players although the frontend sends and displays one); `Nexus/models/Message.js:15-18` (hand-rolled `createdAt` instead of `timestamps`).
- **Severity:** Medium
- **Fix:** Remove the nested populate now (no schema change). The rest are schema changes — decide in the revamp and get approval.

### QUAL-12 — God files in the frontend
- **Where:** `nexus-frontend/src/pages/TournamentDetails.jsx` (517 lines), `nexus-frontend/src/components/Navbar/CircluarNav.jsx` (513), `nexus-frontend/src/pages/Home.jsx` (502), `nexus-frontend/src/pages/admin/AdminBookings.jsx` (478), `nexus-frontend/src/pages/Tournament.jsx` (411)
- **Severity:** Low
- **Why:** Fetching, state, conversion and markup live in one component, which makes logic changes risky under the UI freeze.
- **Fix:** Extract logic into hooks/utilities (`useTournament`, `useBookings`, …) and leave the JSX untouched.

### QUAL-13 — Console logging
- **Where:** `nexus-frontend/src/pages/Payment.jsx:40` (card data — see SEC-19), `nexus-frontend/src/pages/Contact.jsx:44,49`, `nexus-frontend/src/hooks/useApi.js:19`, `nexus-frontend/src/components/StationGrid.jsx:22`; backend `Nexus/middleware.js:26` logs on every unauthenticated request; `Nexus/server.js:15` logs the raw connection error object.
- **Severity:** Low
- **Why:** Noise in user consoles and server logs. No password, token or connection string is logged directly by application code.
- **Fix:** Remove client logs; use a levelled logger on the server.

### QUAL-14 — Documentation contradicts the code
- **Where:** `Nexus/README.md:35-40` (lists endpoints that do not exist: `/api/auth/login`, `/api/bookings/deploy`, …), `Nexus/docs/api-reference.md:77-102,113-123` (wrong booking and dashboard shapes), `Nexus/docs/installation.md:66-69` (`VITE_API_URL`; the code reads `VITE_API_BASE_URL`), `nexus-frontend/index.html:5` references `/favicon.svg`, which is not in `public/`.
- **Severity:** Low
- **Fix:** Treat `docs/API_CONTRACT.md` as the source of truth and delete or redirect the old pages (deletion needs approval). The favicon is an asset **(needs UI decision)**.

---

## 3. Performance

No literal N+1 loops were found: every `populate` is a single extra query per request.

### PERF-01 — List endpoints have no pagination or limits
- **Where:** `Nexus/controllers/booking.js:72`, `Nexus/controllers/message.js:32`, `Nexus/controllers/tournament.js:42` (each tournament carries all teams and players), `Nexus/controllers/admin.js:8-9`
- **Severity:** Medium
- **Why:** Response size and query time grow without bound; the contact inbox is publicly writable (SEC-06).
- **Fix:** Add `limit`/`cursor` (or `page`) with a default cap and return totals. The frozen UI renders whatever array it gets, so start with a server-side cap and newest-first order, and add paging controls only if a UI change is approved.

### PERF-02 — Missing indexes
- **Where:** `Nexus/models/Booking.js` (none on `user`, `status`, `createdAt`, `bookingTime`, `stations`), `Nexus/models/Tournament.js` (none on `status` + `eventTime`, queried on every booking at `Nexus/controllers/booking.js:19-23`), `Nexus/models/Message.js` (none on `createdAt`)
- **Severity:** Medium
- **Why:** Every list and the per-booking clash check are collection scans. Existing unique indexes: `User.email`, `User.username`, `Station.stationId`.
- **Fix:** Add `Booking {user, createdAt}`, `Booking {status}`, `Booking {stations, "bookingTime.start", "bookingTime.end"}`, `Tournament {status, "eventTime.start"}`, `Message {createdAt}`. Index additions are schema changes — need approval.

### PERF-03 — Dashboard loads whole collections to count them
- **Where:** `Nexus/controllers/admin.js:7-21`
- **Severity:** Low
- **Why:** Fetches every station document and every active booking; the frontend uses only the counts and the booking list (`nexus-frontend/src/pages/admin/AdminHUD.jsx:41-64`), never `stationsData`.
- **Fix:** `countDocuments` for totals, a limited `lean()` query for recent bookings; drop `stationsData` from the response after confirming nothing reads it.

### PERF-04 — Auth middleware loads a full user document on every request
- **Where:** `Nexus/middleware.js:16`
- **Severity:** Low
- **Fix:** `.select("_id role email username").lean()`.

### PERF-05 — No route-level code splitting; several heavy UI libraries
- **Where:** `nexus-frontend/src/App.jsx:16-36` (all pages, including the admin area, imported statically); `nexus-frontend/package.json` (`framer-motion`, `gsap`, `lenis`, two icon sets `react-icons` + `lucide-react`)
- **Severity:** Medium *(bundle size not measured)*
- **Why:** Every visitor downloads the admin screens and all animation code up front.
- **Fix:** `React.lazy` per route. This needs a `Suspense` fallback, which is visible while loading **(needs UI decision — a `null` fallback keeps pixels identical)**.

### PERF-06 — Password hashing runs on the event loop
- **Where:** `Nexus/models/User.js:60,65` (`bcryptjs`, pure JavaScript)
- **Severity:** Medium
- **Why:** Each login/register burns tens of milliseconds of CPU on the single Node thread; with no rate limit (SEC-06) a small burst of logins stalls every other request.
- **Fix:** Rate-limit first. Optionally switch to native `bcrypt` or `argon2` (major dependency — needs approval; existing hashes stay compatible with native bcrypt).

### PERF-07 — Avoidable re-renders and repeated fetches
- **Where:** `nexus-frontend/src/context/AuthContext.jsx:57` (new context value object every render re-renders all consumers); `nexus-frontend/src/pages/Tournament.jsx:42-55` and `nexus-frontend/src/pages/TournamentDetails.jsx:40-52` (arrays rebuilt each render); react-query is installed but used once (`nexus-frontend/src/pages/admin/AdminHUD.jsx:9`), so `/tournaments`, `/bookings`, `/stations` are refetched on every mount with no caching or de-duplication; full page reloads at `nexus-frontend/src/components/TournamentRegistrationModal.jsx:234` and `nexus-frontend/src/components/Layout.jsx:20`.
- **Severity:** Medium
- **Fix:** `useMemo` the context value; move generators to module scope; fetch through react-query hooks and invalidate instead of reloading (logic-only).

### PERF-08 — No request timeout; the whole app waits on the session check
- **Where:** `nexus-frontend/src/hooks/useApi.js:7-12`, `nexus-frontend/src/context/AuthContext.jsx:13-29`, `nexus-frontend/src/components/ProtectedRoute.jsx:10-16`
- **Severity:** Low
- **Why:** On a cold Render instance the first `GET /users/profile` can take many seconds; protected pages show a spinner with no timeout or retry.
- **Fix:** Set an axios timeout and a single retry for the session check.

### PERF-09 — Hot-linked third-party images
- **Where:** `nexus-frontend/src/pages/Home.jsx:134-152`, `nexus-frontend/src/pages/Gallery.jsx:6-15`
- **Severity:** Low
- **Why:** Unoptimised images from a third-party host that can remove or block them.
- **Fix:** Assets are frozen **(needs UI decision)**; recorded for later.

---

## 4. Critical flows with no tests

### TEST-01 — There are no automated tests in either package
- **Where:** `Nexus/package.json:7` (`npm test` is a placeholder that exits 1); `nexus-frontend/package.json:6-11` (no test script); no test files or CI in either repo
- **Severity:** High
- **Why:** The backend is about to be rewritten under a frozen UI; without tests nothing proves the contract still holds.
- **Fix:** Add a test runner plus an in-memory or separate MongoDB (dependency approval needed), loading `.env.test`. `Nexus/app.js` is already importable without starting the server.

Untested flows, in the order they should be covered:

| # | Flow | Must prove |
|---|---|---|
| 1 | Register / login / logout / session restore | Cookie is set with the right flags; wrong password and unknown email return 401; object-typed `email` is rejected (SEC-04); logout clears the cookie |
| 2 | `isLoggedIn` | Missing, malformed, expired and wrong-secret tokens return 401; a deleted user returns 401 |
| 3 | `isAdmin` on every admin-only route | A normal user gets 403 on each of the 10 admin routes |
| 4 | Booking ownership | User A cannot list, read, update or delete user B's booking (SEC-01, SEC-17) |
| 5 | Booking creation | Validation, server-computed price, tournament clash, double-booking, station state changes (SEC-03, QUAL-03) |
| 6 | Booking cancel (user and admin) | Stations are released; status/history semantics |
| 7 | Tournament team registration | Capacity, duplicate captain/team name, 5–6 players, closed tournaments (SEC-18) |
| 8 | Team approve / reject | Admin only; resulting roster state |
| 9 | Tournament create / update / delete | Admin only; validation; public responses contain no phone numbers (SEC-02) |
| 10 | Contact message create / list / mark read / delete | Public create is validated and rate-limited; the rest are admin only |
| 11 | Frontend API layer and `AuthContext` | Base URL from env, credentials always sent, user state after login/logout/401 |
| 12 | Frontend date/time → ISO helpers | Today/Tomorrow/any month, AM/PM, duration (QUAL-09) |

---

## 5. Deployment assumptions

### DEP-01 — Contact form posts to the dead Render URL
- **Where:** `nexus-frontend/src/pages/Contact.jsx:38-41`
- **Severity:** Critical (the feature is 100% broken in production today)
- **Why:** Hard-coded `https://nexus-9m3i.onrender.com/api/messages`, bypassing the configured base URL.
- **Fix:** Call `POST /messages` through the shared API layer (logic-only).

### DEP-02 — Profile page is hard-coded to `http://localhost:3005/api`
- **Where:** `nexus-frontend/src/pages/Profile.jsx:31-34`
- **Severity:** High
- **Why:** In production it calls the visitor's own machine. It also sends `Authorization: Bearer undefined` and no cookie, and the endpoints it calls do not exist (API_CONTRACT.md M-02, M-03).
- **Fix:** Use the shared API layer, and add the two endpoints to the backend or disable the handlers — contract decision.

### DEP-03 — API base URL silently falls back to localhost; env variable name is inconsistent
- **Where:** `nexus-frontend/src/hooks/useApi.js:8-9`, `nexus-frontend/src/context/AuthContext.jsx:9-10`; `nexus-frontend/.env.test` defines `REACT_APP_API_URL`; `Nexus/docs/installation.md:68` says `VITE_API_URL`; `nexus-frontend/README.md:40` says `REACT_APP_API_URL`
- **Severity:** High
- **Why:** The code reads only `VITE_API_BASE_URL`. If Vercel has any other name set, the production build calls `localhost:3005` with no build error. The value must also include the `/api` suffix.
- **Fix:** One `config` module that reads `VITE_API_BASE_URL` and throws in production builds when it is missing; align docs and `.env.test`. **Owner action:** set `VITE_API_BASE_URL` in Vercel to the new Render URL + `/api` and redeploy.

### DEP-04 — Auth depends on a third-party cookie between `vercel.app` and `onrender.com`
- **Where:** `Nexus/controllers/user.js:23-27,64-68`; `nexus-frontend/vercel.json:1-8`
- **Severity:** High
- **Why:** The frontend and API are on unrelated sites, so the auth cookie is a third-party cookie. Safari blocks these by default and other browsers block them in private modes and are restricting them further; for those users login appears to succeed and then every request is 401. No cookie `domain` is set (host-only), which is correct.
- **Fix — decided 2026-11-11: proxy `/api` through Vercel.** Add a Vercel rewrite `/api/:path*` → `<new Render URL>/api/:path*`, placed **before** the existing catch-all SPA rewrite in `vercel.json`; set `VITE_API_BASE_URL=/api` in Vercel; switch the cookie to `SameSite=Lax` (+ `Secure` in production). The browser then sees one origin, which also removes most CORS and CSRF exposure (SEC-05). This is a routing change, not a UI change. It cannot be made until the new Render service URL exists. Consequences to handle in the same work: the backend sees Vercel's proxy as the client, so `trust proxy` and rate limiting must use the forwarded address (DEP-07, SEC-06); local dev keeps calling `http://localhost:3005/api` directly, where `SameSite=Lax` works because both are `localhost`. (The rejected alternative was a custom domain with `app.`/`api.` subdomains.)

### DEP-05 — CORS allows exactly one production origin
- **Where:** `Nexus/app.js:15-20`
- **Severity:** Medium
- **Why:** `CLIENT_URL` must match the browser origin exactly (scheme, host, no trailing slash). Vercel preview deployments and any second domain are blocked. See also SEC-14.
- **Fix:** Accept a comma-separated `CLIENT_URL` list (or the DEP-04 proxy, which removes the need).

### DEP-06 — `NODE_ENV` must be `production` on Render or login cookies are rejected
- **Where:** `Nexus/controllers/user.js:25,66`
- **Severity:** Medium
- **Why:** See SEC-13. This is a deploy-time setting that fails silently.
- **Fix:** Set it explicitly on the new service; add a startup log line stating the cookie mode (no secrets).

### DEP-07 — `trust proxy` is not configured
- **Where:** `Nexus/app.js` (absent)
- **Severity:** Medium
- **Why:** Render terminates TLS in front of the app; without it `req.ip` is the proxy's address (breaks rate limiting — SEC-06) and `req.secure` is false.
- **Fix:** `app.set("trust proxy", 1)` in production, after upgrading `proxy-addr` (SEC-07).

### DEP-08 — A fresh database has no stations and no admin
- **Where:** `nexus-frontend/src/components/StationGrid.jsx:57-65`; `Nexus/seedStations.js`; `Nexus/models/User.js:29-32`
- **Severity:** Medium
- **Why:** If the new service points at a new database, booking shows "No Stations Found" until stations are seeded, and there is no way to create an admin except editing the database (register always creates `User`). `Nexus/init/index.js:1` loads `../.env` relative to the current directory and `Nexus/init/setupData.js:14` hard-codes a local MongoDB URL.
- **Fix:** A safe, idempotent seed (upsert stations; create one admin from env-provided credentials) with the production guard from SEC-15. **Owner question:** is the old Atlas database still reachable, or does the new service start empty?

### DEP-09 — PORT, start command and health check
- **Where:** `Nexus/server.js:1,6,18`; `Nexus/package.json:6-10`
- **Severity:** Low
- **Why:** `PORT` is read as `process.env.PORT || 3005` and `listen` binds all interfaces — correct for Render. `dotenv` loads `./.env` relative to the working directory, which is simply absent on Render (env comes from the dashboard). There is no health endpoint for Render's health check, no `engines` field to pin the Node version, and `npm run dev` uses `npx nodemon`.
- **Fix:** Add `GET /api/health`; add `"engines": { "node": ">=20" }` (local is v22); start command `npm start`.

### DEP-10 — Remaining references to old hosts
- **Where:** `nexus-frontend/src/pages/Contact.jsx:39` (old Render URL — the only reference to the old backend in either repo's current code); `Nexus/README.md:10`, `nexus-frontend/README.md:9` (current Vercel URL `nexus-frontend-lyart.vercel.app`, still valid); `Nexus/init/setupData.js:14` (local MongoDB)
- **Severity:** Low
- **Fix:** Covered by DEP-01; update READMEs when the new service URL exists.

---

## Prioritised fix order

Each step is small enough for its own branch and commit(s). Contract-affecting steps follow rule 5 (paired commits + `docs/MIGRATION_LOG.md`).

**Step 0 — Owner actions before any code (no code change)**
1. Generate a new strong `JWT_SECRET` for the new Render service; set `NODE_ENV=production`, `CLIENT_URL`, `MONGO_URI`, `PORT` is provided by Render (SEC-10, DEP-06).
2. ~~Decide the cookie strategy~~ — decided: Vercel `/api` proxy (DEP-04). Remaining owner action: create the Render service and share its URL so the rewrite can be added.
3. Confirm whether the old database is still in use; if so check for the ten sample accounts (SEC-15, DEP-08).
4. Approve the dependency additions this plan needs: test runner + in-memory MongoDB, rate limiter, `helmet`.

**Step 1 — Safety net**
5. Ignore `.env*`, add `.env.example` in both repos (SEC-16).
6. `npm audit fix` in both packages; remove unused packages after approval (SEC-07, QUAL-01, QUAL-02).
7. Test harness + tests for flows 1–4 of §4 written against *current* behaviour where it is correct (TEST-01).

**Step 2 — Make the backend deployable**
8. Startup hardening: required-env check, connect-then-listen, `SIGTERM`, health endpoint, `trust proxy`, `engines` (QUAL-05, SEC-10, DEP-07, DEP-09).
9. CORS from env, localhost only outside production (SEC-14, DEP-05).
10. Shared cookie helper with correct flags per environment (SEC-13).
11. Safe idempotent seed with production guard (SEC-15, DEP-08).

**Step 3 — Close the data leaks and injection holes**
12. Zod validation on every body/param + `sanitizeFilter` (SEC-04, SEC-11, SEC-21).
13. Scope `GET /bookings` to the caller; fix the owner check (SEC-01, SEC-17).
14. Strip player PII from public tournament responses (SEC-02) — contract change.
15. Drop `express.urlencoded`, add Origin check, rate limiting, `helmet` (SEC-05, SEC-06, SEC-08).
16. Central error handling and logging; stop returning raw error text (QUAL-04, SEC-12).

**Step 4 — Reconnect the frontend (logic only)**
17. Single API module + config; fix Contact and Profile calls; one logout path (DEP-01, DEP-02, DEP-03, QUAL-07, QUAL-08, QUAL-10).
18. Resolve every mismatch in API_CONTRACT.md §3, endpoint by endpoint.

**Step 5 — Correctness of the core flow**
19. Booking redesign: server-side price, time-window availability, atomic station claim, release on completion (SEC-03, QUAL-03).
20. Tournament registration checks and atomicity (SEC-18); token revocation/refresh decision (SEC-09).
21. Frontend date utilities with tests (QUAL-09).

**Step 6 — Performance and cleanup**
22. Indexes and list caps (PERF-01, PERF-02) — schema approval.
23. Dashboard query, lean auth lookup (PERF-03, PERF-04).
24. react-query adoption, context memoisation, timeouts (PERF-07, PERF-08); code splitting if the fallback is approved (PERF-05).
25. Remove dead files, fix docs, model drift (QUAL-01, QUAL-02, QUAL-11, QUAL-14) — deletions and schema changes need approval.
