# Nexus API Contract

- **Status:** v0 — describes the API **as implemented today** (backend commit `524f698`, frontend commit `8d178c2`), captured on 2026-11-11 by reading the code. Nothing here was verified against a running server.
- This file is the source of truth from now on. Any API change updates this file first, then backend, frontend API layer and tests in paired commits, and is logged in `docs/MIGRATION_LOG.md` (see root `CLAUDE.md`, rule 5).
- It supersedes `docs/api-reference.md` and the endpoint table in `README.md`, both of which are inaccurate.
- Paths: `Nexus/…` is the backend repo, `nexus-frontend/…` the frontend repo. Finding ids (SEC-01 …) refer to `docs/AUDIT.md`.

## 0. Conventions

| Item | Current behaviour |
|---|---|
| Base path | `/api` (frontend base URL = `VITE_API_BASE_URL`, must include `/api`; falls back to `http://localhost:3005/api`) |
| Request body | JSON only (`Content-Type: application/json`). Any other body type on POST/PUT/DELETE → **415** `"Content-Type must be application/json."` (ML-004) |
| Origin check | On POST/PUT/DELETE, an `Origin` header that is not an allowed frontend origin → **403** `"Origin not allowed."` Requests without `Origin` (non-browser clients) pass (ML-004) |
| Auth | httpOnly cookie `token` containing a JWT `{ userId }`, HS256, 7 days. **No `Authorization` header support.** The browser must send credentials (`withCredentials: true`) |
| Cookie flags | `httpOnly`, `path=/`, `maxAge` 7 days (same as the JWT), no `domain`. Production: `Secure; SameSite=None` (or `SameSite=<COOKIE_SAMESITE>` when that env var is `lax`/`strict`). Elsewhere: `SameSite=Lax`, not `Secure`. Login, register and logout share one definition (ML-008) |
| Roles | `"User"` (default) and `"Admin"` on `User.role` |
| Ids | MongoDB ObjectId strings. Stations are also addressed by `stationId` such as `"PC-01"`, `"C-05"` |
| Dates | ISO 8601 strings in requests; ISO strings in responses |

### Success envelope

```json
{ "success": true, "message": "optional text", "<payloadKey>": {} }
```

The payload key differs per endpoint (`user`, `booking`, `bookings`, `tournament`, `tournaments`, `team`, `station`, `stations`, `messages`, `wishlist`, `data`).

### Rate limits (ML-005)

Per client IP; over the limit → **429** `{ success: false, message: "Too many …" }` with `RateLimit` / `Retry-After` headers.

| Scope | Limit |
|---|---|
| All `/api/*` | 600 requests / 15 min |
| `POST /users/login` | 10 **failed** attempts / 15 min |
| `POST /users/register` | 10 / hour |
| `POST /messages` | 10 / hour |

### Ids and validation (ML-012)

A route parameter that is not a 24-character hex ObjectId → **400** `"Invalid id."` on every route (was a 500 with the route's generic error text). Bodies are validated with Zod on every route that takes one; a violation → **400** with a message naming the field. Unknown body keys are dropped.

### Operator keys

Any JSON body containing a key that starts with `$` or contains `.` (at any depth) is refused with 400 `"Invalid request."` before it reaches a route (SEC-04).

### Error envelope

```json
{ "success": false, "message": "human-readable text" }
```

| Status | When (today) |
|---|---|
| 400 | Missing required field on a few endpoints; business rule failures; **any** error during register (raw error text — SEC-12) |
| 401 | `isLoggedIn`: `"No token provided."`, `"User not found in database."`, `"Invalid or expired token."`; login: `"Invalid Email or Password"` |
| 403 | `isAdmin`: `"Unauthorized. Admin Access Required."`; booking owner checks |
| 404 | Resource not found; unknown route: `"API Endpoint Not Found!"` |
| 422 | Register with an existing email |
| 500 | Everything else, including malformed ids and validation failures (SEC-21, QUAL-04) |

No endpoint returns field-level validation errors, and no response includes a stack trace.

### Auth middleware

- `isLoggedIn` (`Nexus/middleware.js:4-31`) — verifies the cookie JWT and loads the user into `req.user`.
- `isAdmin` (`Nexus/middleware.js:33-42`) — requires `req.user.role === "Admin"`.

In the tables below: **Public** = no middleware, **User** = `isLoggedIn`, **Admin** = `isLoggedIn` + `isAdmin`.

---

## 1. Backend endpoints

### 1.1 Users — `Nexus/routes/user.js`, `Nexus/controllers/user.js`

#### `POST /api/users/register` — Public
- **Body:** `{ username, email, password, phone? }` — validated, 400 + field message otherwise (ML-006): `username` 3–30 chars of letters, numbers, space, `_ . -`; `email` a valid address; `password` 8–128 chars; `phone` 7–20 digits/`+ - ( )`/spaces
- **201:** `{ success, user: { _id, email, username, phone?, role } }` and sets the `token` cookie (the user is logged in) (ML-011)
- **Errors:** 400 validation message; 422 `"User already exists with this email"` or `"Username is already taken"`; 500 `"Server error during registration"`. Raw database errors are never returned (ML-007)

#### `POST /api/users/login` — Public
- **Body:** `{ email: string, password: string }`
- **200:** `{ success, user: { _id, email, username, phone?, role } }` and sets the `token` cookie (ML-011; `role` and `phone` were missing before — contract M-05)
- **Errors:** 400 when `email`/`password` is missing or not a string (`"Email is required"`, `"Password is required"`; was 500); 401 `"Invalid Email or Password"`; 500 `"Server error during login"`

#### `POST /api/users/logout` — Public
- **Body:** none
- **200:** `{ success, message: "Logged out successfully." }`; overwrites the cookie with an expired one. The JWT itself stays valid (SEC-09).

#### `GET /api/users/profile` — User
- **200:** `{ success, user: { _id, email, username, phone?, role, wishlist: string[], bookings: [], createdAt, updatedAt } }` (password excluded). `bookings` is always empty today (QUAL-11).
- **Errors:** 401 (middleware); 404 `"User not found"`; 500 `"Error fetching profile"`

#### `POST /api/users/wishlist` — User
- **Body:** `{ stationId: string }` — toggles
- **200:** `{ success, message, wishlist: string[] }`
- **Errors:** 400 `"Station ID is required"`; 500

### 1.2 Stations — `Nexus/routes/station.js`, `Nexus/controllers/station.js`

#### `GET /api/stations` — Public
- **200:** `{ success, stations: Station[] }` sorted by `stationId`

```
Station = {                         // public shape (ML-013)
  _id, stationId: "PC-01", type: "PC" | "Console",
  status: "Available" | "Occupied" | "Maintenance" | "Offline"
}
```

`assignedUser`, `activeBooking`, `createdAt`, `updatedAt` are no longer returned here (SEC-22). The admin-only `PUT /admin/station/:stationId` still returns the full document.
- **Errors:** 500 `"Error loading seat map data"`

### 1.3 Bookings — `Nexus/routes/booking.js`, `Nexus/controllers/booking.js` (all **User**)

```
Booking = {
  _id, user: ObjectId | { _id, username, email? },
  stations: string[],              // stationId values
  name, email, phone,
  bookingType: "PC" | "Console",
  membersCount: number, membersName: string[],
  bookingTime: { start, end },
  totalAmount: number,
  status: "Active" | "Completed" | "Cancelled",
  createdAt, updatedAt
}
```

#### `POST /api/bookings`
- **Body:** `{ name, email, phone, bookingType: "PC" | "Console", membersCount: 1–60, membersName?: string[], bookingTime: { start, end }, stations: string[] }` — validated (ML-002). `end` must be after `start`, at most 24 h; `stations` non-empty, unique, no more than `membersCount`. A `totalAmount` sent by the client is **ignored**: the server stores `membersCount × hours × 100`.
- **Stations:** every listed station must exist and be `Available`; they are claimed atomically. Otherwise **409** `"One or more selected stations are not available."` and nothing is booked.
- **Validation errors:** **400** with a field message (e.g. `"Booking time is required"`); previously these were 500.
- **201:** `{ success, message: "Deployment Confirmed!", booking: Booking }`; side effect: listed stations become `Occupied`
- **Errors:** 400 `"Cafe is reserved for '<tournament title>'."` when the window overlaps an Upcoming / Registration Open / Live tournament; 500 `"Something went wrong while booking!"`

#### `GET /api/bookings`
- **200:** `{ success, bookings: Booking[] }` — **all users' bookings** (SEC-01), `user` populated with `username`, `email`, newest first
- **Errors:** 500 `"Sync Error."`

#### `GET /api/bookings/:bookingId`
- **200:** `{ success, booking: Booking }` with `user` populated (`username`)
- **Errors:** 404 `"Not found"`; 403 `"Forbidden Access."` for anyone who is neither the owner nor an admin (the owner now succeeds — SEC-17 fixed, ML-009); 500 `"Error."`

#### `PUT /api/bookings/:bookingId` — owner or admin
- **Body:** `{ phone?, bookingTime?: { start, end } }` — validated (400). `totalAmount` from the client is ignored; when `bookingTime` changes the server recomputes it, and a window that overlaps an active tournament is refused with 400 `"Cafe is reserved for '<title>'."` (ML-002)
- **200:** `{ success, message: "Re-calibrated!", booking: Booking }`
- **Errors:** 404 `"Not found"`; 403 `"Forbidden."`; 500 `"Update failed."`

#### `DELETE /api/bookings/:bookingId` — owner or admin
- **200:** `{ success, message: "Deployment Aborted." }`; the booking is **hard-deleted** and its stations set to `Available`
- **Errors:** 404 `"Not found."`; 403 `"Unauthorized."`; 500 `"Delete failed."`

### 1.4 Tournaments — `Nexus/routes/tournament.js`, `Nexus/controllers/tournament.js`

```
Tournament = {
  _id, title, game, description?,
  prize: string, entryFee: string, format: string, thumbnail: string, rules: string[],
  eventTime: { start, end },
  maxTeams: number,
  registeredTeams: Team[],
  status: "Upcoming" | "Registration Open" | "Live" | "Completed" | "Cancelled",
  createdAt, updatedAt
}
Team       = { _id, teamName, captain: ObjectId, players: Player[], status: "Pending" | "Approved" | "Rejected", assignedPCs: ObjectId[] }   // admins only
PublicTeam = { _id, teamName, status }         // everyone else (ML-001)
Player     = { _id, name, inGameId, phone }    // 5 or 6 per team
```

`registeredTeams` in the two GET responses below is `Team[]` when the request carries a valid admin cookie and `PublicTeam[]` otherwise (anonymous, non-admin, or invalid/expired cookie — the GETs never answer 401). Array length is unchanged, so team counts still work.

#### `GET /api/tournaments` — Public
- **200:** `{ success, tournaments: Tournament[] }` sorted by `eventTime.start`. Rosters only for admins (see above; SEC-02 fixed, ML-001)
- **Errors:** 500 `"Error fetching tournaments"`

#### `GET /api/tournaments/:tournamentId` — Public
- **200:** `{ success, tournament: Tournament }` (same roster rule)
- **Errors:** 404 `"Tournament not found"`; 500 `"Error fetching tournament details"`

#### `POST /api/tournaments` — Admin
- **Body:** `{ title, game, description?, eventTime: { start, end }, maxTeams }`
- **201:** `{ success, tournament: Tournament }`
- **Errors:** 401/403; 500 `"Error creating tournament"` (also for validation failures)

#### `PUT /api/tournaments/:tournamentId` — Admin
- **Body:** any of `{ title, game, description, eventTime, maxTeams, status, prize, entryFee, format, thumbnail, rules }`; other keys are ignored. Validated (ML-009): `status` must be one of the enum values, `eventTime.end` after `start`, `maxTeams` 1–256 (numeric strings accepted), `thumbnail` an http(s) URL, `rules` a list of strings → 400 + field message otherwise
- **200:** `{ success, message: "Tournament updated successfully!", tournament: Tournament }`
- **Errors:** 401/403; 404 `"Tournament not found"`; 500 `"Error updating tournament details."`

#### `DELETE /api/tournaments/:tournamentId` — Admin
- **200:** `{ success, message: "Tournament deleted successfully. All time slots are now free!" }`
- **Errors:** 401/403; 404; 500 `"Error deleting tournament"`

#### `POST /api/tournaments/:tournamentId/register` — User
- **Body:** `{ teamName: string (2–40), players: [{ name, inGameId, phone }] }`, 5–6 players — validated, 400 + field message otherwise (ML-010). Extra player keys such as `email` are dropped. The caller becomes `captain`.
- **201:** `{ success, message: "Team registered successfully", team: Team }`
- **Errors:** 401; 404 `"Tournament not found"`; 400 `"Registration is closed for this tournament"` (status `Completed` or `Cancelled`, ML-010); 400 `"Tournament is full"`; 400 `"You or this team name are already registered"`; 500 `"Error registering team"`. Capacity and duplicate checks are atomic.

#### `PUT /api/tournaments/:tournamentId/team/:teamId/status` — Admin
- **Body:** `{ status: "Approved" | "Rejected" | "Pending" }`
- **200 (`Rejected`):** `{ success, message: "Squad rejected and removed from roster.", action: "deleted" }` — the team is **removed**, not marked Rejected
- **200 (otherwise):** `{ success, message: "Squad <status> successfully!", team: Team, action: "updated" }`
- **Errors:** 401/403; 404 `"Tournament not found"` / `"Squad not found in this tournament."`; 500 `"Failed to process squad."`

### 1.5 Messages — `Nexus/routes/message.js`, `Nexus/controllers/message.js`

```
Message = { _id, name, email, phone?, subject: string (default "No Subject"), message, status: "Unread" | "Read", createdAt }
```

#### `POST /api/messages` — Public
- **Body:** `{ name, email, message, phone?, subject? }`
- **201:** `{ success, message: "Transmission sent successfully!" }`
- **Errors:** 400 `"Please fill all the required fields."`; 500 `"Something went wrong, please try again later!"`

#### `GET /api/messages` — Admin
- **200:** `{ success, messages: Message[] }` newest first
- **Errors:** 401/403; 500 `"Error fetching messages"`

#### `PUT /api/messages/:id/read` — Admin
- **200:** `{ success, message: "Marked as Read", data: Message }`
- **Errors:** 401/403; 404 `"Transmission not found"`; 500 `"Error updating status"`

#### `DELETE /api/messages/:id` — Admin
- **200:** `{ success, message: "Transmission deleted" }`
- **Errors:** 401/403; 404 `"Transmission not found"`; 500 `"Error deleting transmission"`

### 1.6 Admin — `Nexus/routes/admin.js`, `Nexus/controllers/admin.js` (all **Admin**)

#### `GET /api/admin/dashboard`
- **200:** `{ success, data: { totalStations: number, stationsData: Station[], activeBookingsCount: number, activeBookingsData: Booking[] (user populated: username, email), totalGamers: number } }`
- **Errors:** 401/403; 500 `"Error fetching God Eye data"`

#### `PUT /api/admin/station/:stationId` — `:stationId` is the station's **`_id`**, not `"PC-01"`
- **Body:** `{ status: "Available" | "Occupied" | "Maintenance" | "Offline" }`
- **200:** `{ success, message: "<stationId> is now marked as <status>", station: Station }`
- **Errors:** 401/403; 404 `"Station not found"`; 500 `"Error updating station status"`

#### `PUT /api/admin/booking/:bookingId/cancel`
- **200:** `{ success, message: "Admin forcefully cancelled the booking. Units are now free." }`; sets `status: "Cancelled"` (soft) and frees stations
- **Errors:** 401/403; 404 `"Booking not found"`; 400 `"Booking is already Cancelled|Completed"`; 500 `"Error cancelling booking"`

### 1.7 Fallback
- Any other path: 404 `{ success: false, message: "API Endpoint Not Found!" }` (`Nexus/app.js:33-35`)

---

## 2. Frontend API calls

**Token handling (applies to every row):** the frontend never sees or stores the token. Calls made through `useApi` (`nexus-frontend/src/hooks/useApi.js:7-12`) or `AuthContext` send the cookie via `withCredentials: true`. On a 401 the `useApi` interceptor only writes a console warning (`:17-21`) — there is no redirect, no refresh and no clearing of `user`. The two exceptions (Contact, Profile) are called out below.

All paths are relative to `nexus-frontend/src/`.

| # | File:line | Endpoint | Body sent | Response fields read | Error handling |
|---|---|---|---|---|---|
| F-01 | `context/AuthContext.jsx:15` | `GET /users/profile` (on app mount) | – | `data.user` → context `user`; UI later reads `username`, `email`, `phone`, `role` | Any error → `user = null`; non-401 also logged to console |
| F-02 | `context/AuthContext.jsx:34` | `POST /users/login` | `{ email, password }` | `data.user` → context `user`; returns `data` | Throws to caller; `pages/Login.jsx:24` toasts `response.data.message` or a fallback |
| F-03 | `context/AuthContext.jsx:45` | `POST /users/logout` | `{}` | none | Logged to console; `user` is cleared regardless. Only called from `pages/Profile.jsx:55` |
| F-04 | `components/Layout.jsx:19` | `POST /users/logout` | none | none | On success hard-redirects to `/login`; on failure console only, user stays logged in |
| F-05 | `pages/Register.jsx:22` | `POST /users/register` | `{ username, email, phone, password }` | none (then navigates to `/login`) | Toast `response.data.message` or fallback |
| F-06 | `components/StationGrid.jsx:17` | `GET /stations` | – | `data.success`, `data.stations[]` → `_id`, `stationId`, `type`, `status` | Console + fixed toast |
| F-07 | `pages/Booking.jsx:91` | `POST /bookings` | `{ name, email, phone, bookingType, membersCount, membersName: [name], bookingTime: { start, end }, stations, totalAmount }` (`:79-89`) | `data.success` | Shows `response.data.message` or fallback in the page |
| F-08 | `pages/BookingList.jsx:31` | `GET /bookings` | – | `data.success`, `data.bookings[]` → `_id`, `name`, `email`, `phone`, `bookingType`, `membersCount`, `stations[]`, `bookingTime.start`, `user.username` | Fixed toast |
| F-09 | `pages/BookingList.jsx:55` | `DELETE /bookings/:id` | – | none (removes the row locally) | Toast `response.data.message` or fallback |
| F-10 | `components/UpdateBooking.jsx:65` | `GET /bookings/:id` | – | `data.success`, `data.booking` → `phone`, `bookingTime.start`, `bookingTime.end`, `membersCount` | Toast `response.data.message` or fallback, then navigates to `/bookings` |
| F-11 | `components/UpdateBooking.jsx:125` | `PUT /bookings/:id` | `{ phone, bookingTime: { start, end }, totalAmount }` | none | Fixed toast (server message ignored) |
| F-12 | `pages/Tournament.jsx:59` | `GET /tournaments` | – | `data.success`, `data.tournaments[]` → `_id`, `title`, `game`, `maxTeams`, `eventTime.start`, `registeredTeams.length` | Fixed toast |
| F-13 | `pages/Tournament.jsx:99` | `POST /tournaments` | `{ title, game, description, maxTeams, eventTime: { start, end } }` (`maxTeams` becomes a string after editing, `:296`) | none (refetches the list) | Toast `response.data.message` or fallback |
| F-14 | `pages/TournamentDetails.jsx:56` | `GET /tournaments/:id` | – | `data.success`, `data.tournament` → `title`, `game`, `description`, `maxTeams`, `status`, `eventTime.start`, `eventTime.end`, `registeredTeams[]` → `teamName`, `status` | Fixed toast; page renders nothing |
| F-15 | `pages/TournamentDetails.jsx:88` | `DELETE /tournaments/:id` | – | none | Fixed toast |
| F-16 | `pages/TournamentDetails.jsx:111` | `PUT /tournaments/:id` | `{ title, game, description, maxTeams, status, eventTime: { start, end } }` plus UI-only `selectedDate`, `startTime`, `endTime` | none (refetches) | Fixed toast |
| F-17 | `components/TournamentRegistrationModal.jsx:61` | `POST /tournaments/:id/register` | `{ teamName, players: [5 × { name, inGameId, email, phone }] }` | none | Toast `response.data.message` or fallback |
| F-18 | `components/TournamentRegisterForm.jsx:61` *(component is never rendered)* | `POST /tournaments/:id/register` | `{ teamName, email, discordId, gameId, entryType, acceptRules }` | none | Toast `response.data.message` or fallback |
| F-19 | `pages/admin/AdminHUD.jsx:12` (react-query) | `GET /admin/dashboard` | – | `data.data` → `activeBookingsCount`, `totalStations`, `totalGamers`, `activeBookingsData[]` → `_id`, `user.username`, `stations[]`, `bookingTime.start`, `status` | `isError` → fixed error panel |
| F-20 | `pages/admin/AdminBookings.jsx:33` | `GET /bookings` | – | `data.success`, `data.bookings[]` → `_id`, `name`, `email`, `user.username`, `user.email`, `stations[]`, `bookingTime.start`, `bookingTime.end`, `status` (compares against `"Active"`, `"Pending"`, `"Completed"`) | Fixed toast |
| F-21 | `pages/admin/AdminBookings.jsx:34` | `GET /tournaments` | – | `data.success`, `data.tournaments[]` → `_id`, `title`, `registeredTeams[]` → `_id`, `teamName`, `status`, `players[]` → `name`, `inGameId`, `email`, `phone` | Fixed toast (shared with F-20) |
| F-22 | `pages/admin/AdminBookings.jsx:59` | `DELETE /bookings/:id` | – | none (removes the row locally) | Toast `response.data.message` or fallback |
| F-23 | `pages/admin/AdminBookings.jsx:77` | `PUT /tournaments/:tid/team/:teamId/status` | `{ status }` | none (sets the team's status locally) | Toast `response.data.message` or fallback |
| F-24 | `pages/admin/AdminMessages.jsx:30` | `GET /messages` | – | `data.success`, `data.messages` (falls back to `data.data`) → `_id`, `name`, `email`, `phone`, `subject`, `message`, `status` (compares against `"New"` and `"Unread"`), `createdAt` | Fixed toast |
| F-25 | `pages/admin/AdminMessages.jsx:47` | `PUT /messages/:id/read` | none | none (sets status locally) | Fixed toast |
| F-26 | `pages/admin/AdminMessages.jsx:65` | `DELETE /messages/:id` | – | none (removes locally) | Fixed toast |
| F-27 | `pages/Contact.jsx:38` | `POST https://nexus-9m3i.onrender.com/api/messages` — **absolute URL to the dead server, plain `axios`, no credentials** | `{ name, email, subject, message }` | `response.status` (200/201) | `alert()` + console |
| F-28 | `pages/Profile.jsx:40` | `PUT http://localhost:3005/api/users/profile` — **own axios instance, hard-coded localhost, header `Authorization: Bearer undefined`, no credentials** | `{ username, phone }` | none (result unused) | Toast `response.data.message` or fallback |
| F-29 | `pages/Profile.jsx:53` | `DELETE http://localhost:3005/api/users/profile` — same instance | – | none; then `logout()` and navigate home | Toast `response.data.message` or fallback |

Pages with **no** API call: `Home`, `Gallery`, `NotFound`, `Payment` (local fake form), `admin/AdminUsers` and `admin/AdminSettings` (hard-coded data), `admin/AdminLayout`.

Backend endpoints with **no** frontend caller: `POST /users/wishlist`, `PUT /admin/station/:stationId`, `PUT /admin/booking/:bookingId/cancel`.

---

## 3. Mismatches

Severity here means impact on the user-facing app once the new backend is live.

| ID | Severity | Frontend | Backend | Effect | Proposed resolution |
|---|---|---|---|---|---|
| M-01 | Critical | F-27 posts to the old Render host | `POST /api/messages` exists | Contact form always fails | Frontend: use the API layer (logic-only) |
| M-02 | High | F-28/F-29 call `PUT` and `DELETE /users/profile` | Neither route exists → 404 `"API Endpoint Not Found!"` | Edit profile and delete account never work | Decide: implement both endpoints (delete must also handle the user's bookings and teams) or leave the handlers failing. Contract decision |
| M-03 | High | F-28/F-29 use `Authorization: Bearer ${token}`, `token` read from `AuthContext`, which does not provide one; no cookie sent; base URL is localhost | Cookie-only auth | Even if M-02 is fixed the calls would be unauthenticated and go to the wrong host | Frontend: use the API layer; drop the header |
| M-04 | High | F-08 shows the list to every user and labels it "Your Squad" for non-admins; decides ownership by `user.email === booking.email` | Returns all bookings to everyone | Customers see each other's bookings and contact details | Backend: scope to caller unless admin (SEC-01). No frontend change needed |
| M-05 | High | After F-02 the UI reads `user.role` and `user.phone` | Login/register return only `_id`, `email`, `username` | Admin controls stay hidden and phone is blank until a full reload | Backend: return the profile shape from login/register, or frontend refetches the profile after login |
| M-06 | High | F-10 expects the owner to load their booking | Owner check compares against a populated document → 403 for owners *(not runtime-verified)* | Booking edit page bounces normal users back with an error | Backend: fix the check (SEC-17) |
| M-07 | High | Env var name: code reads `VITE_API_BASE_URL` | Docs say `VITE_API_URL`; `nexus-frontend/.env.test` and README say `REACT_APP_API_URL` | A wrongly named variable silently points production at localhost | One name everywhere; fail the production build when missing (DEP-03) |
| M-08 | Medium | F-17 sends `players[].email`; F-21 displays `player.email` | Player schema has no `email`; Mongoose drops it | Email column in the admin roster is always empty | Either add `email` to the player schema (schema change, needs approval) or accept it blank |
| M-09 | Medium | F-20 styles `booking.status === "Pending"` | Enum is `Active`/`Completed`/`Cancelled`; nothing ever sets `Completed` | Two of the UI's states can never appear | Define the booking lifecycle in the revamp (QUAL-03) and keep the existing strings |
| M-10 | Medium | F-22 (admin) uses `DELETE /bookings/:id` | A dedicated soft-cancel endpoint exists and is unused; DELETE hard-deletes | Booking history is destroyed on every cancel; `Cancelled` status never appears | Decide one cancel semantic; if soft-cancel, list endpoints must filter so the frozen UI still sees the row disappear |
| M-11 | Medium | F-23 sets the team to `Rejected` locally and keeps showing it | Backend deletes the team on `Rejected` | The row shows "Rejected" until refresh, then vanishes | Pick one: keep rejected teams (backend) or remove locally (frontend logic) |
| M-12 | Medium | F-05 ignores the response and sends the user to the login page | Register already sets the auth cookie | User is silently logged in while being told to log in; context `user` is stale until reload | Either stop setting the cookie on register or have the frontend set `user` and skip login (the redirect target is behaviour, not markup — confirm before changing) |
| M-13 | Medium | F-04 logs out without `AuthContext`; F-03 exists but is used only by Profile | One endpoint | Two code paths with different failure behaviour | Frontend: single logout in the context |
| M-14 | Medium | Public pages (F-12, F-14) read only `teamName`, `status` and the team count; admin page (F-21) needs full rosters from the **same** endpoint | Public endpoints return full rosters incl. phones | Fixing SEC-02 by trimming the public response would empty the admin roster | Return full rosters only when the caller is an admin (optional auth on the GET), or add an admin roster endpoint and switch F-21 to it |
| M-15 | Medium | F-07 sends `totalAmount` computed as `players × hours × 100` (`components/HUDTimePicker.jsx:73`); F-11 recomputes with its own copy | Stores whatever is sent | Price is client-controlled | Backend computes and returns the amount; frontend value becomes display-only |
| M-16 | Low | F-16 sends `selectedDate`, `startTime`, `endTime` | Ignored | None today; would be rejected by strict validation | Frontend: send only contract fields before strict validation is enabled |
| M-17 | Low | F-13 may send `maxTeams` as a string | Mongoose casts it | None today; strict Zod `number` would reject | Coerce on the frontend or use `z.coerce.number()` |
| M-18 | Low | F-24 treats `"New"` as unread and falls back to `data.data` | Status enum is `Unread`/`Read`; key is `messages` | None | Leave; remove the fallback when the API layer is centralised |
| M-19 | Low | F-18 payload has no `players` | Requires 5–6 players | Would always fail — but the component is never rendered | Delete the dead component (needs approval) |
| M-20 | Low | F-07 always sends `membersName: [name]` (one entry) with `membersCount` up to the group size | Unused Zod schema requires a non-empty array only | None today | Keep as is; do not require `membersName.length === membersCount` |
| M-21 | Low | No screen calls wishlist, station status or admin soft-cancel | Three endpoints exist | Unused surface | Keep documented; remove or wire up later |
| M-22 | Low | `admin/AdminUsers` and `admin/AdminSettings` show hard-coded data | No user-management or settings endpoints | Screens are decorative | Out of scope until endpoints are designed |
| M-23 | Low | 401 on any call only logs a console warning | Returns 401 when the cookie expires | An expired session leaves the UI in a "logged in" state with failing calls | Frontend: on 401 clear `user` in the context (existing `ProtectedRoute` then redirects) |
| M-24 | Low | Old docs (`docs/api-reference.md`) describe `stationId`/`startTime`/`endTime` bookings and `totalUsers`/`totalBookings`/`activeStations` dashboard | Neither exists | Misleading for the revamp | This file replaces them |

---

## 4. Frontend files: frozen UI vs editable logic

The frontend has **no separate logic layer yet**: apart from three files, logic and markup live together in `.jsx` components. The split is therefore by file where possible and by **region within a file** otherwise.

**Rule for mixed files:** everything above the component's `return (` (imports, hooks, state, effects, handlers, payload building) is editable logic. The returned JSX, every `className`, all user-visible strings (including toast/alert text and Zod error messages shown in the form), inline style/animation props and static content arrays are frozen. Early-return loading/empty blocks are JSX and are frozen too.

### 4.1 Frozen entirely (UI / assets / styling)

| File | Notes |
|---|---|
| `nexus-frontend/index.html` | Title, fonts, favicon link |
| `nexus-frontend/public/Images/Logo.jpg` | Asset |
| `nexus-frontend/src/index.css` | Global styles |
| `nexus-frontend/src/components/Navbar/CircularNav.css` | Styles |
| `nexus-frontend/src/components/Navbar/CircluarNav.jsx` | Navigation UI and animation only |
| `nexus-frontend/src/components/Footer.jsx` | Static |
| `nexus-frontend/src/components/BootLoader.jsx` | Boot animation |
| `nexus-frontend/src/components/PageTransition.jsx` | Animation wrapper |
| `nexus-frontend/src/components/Toast.jsx` | Presentational (unused) |
| `nexus-frontend/src/components/PlayerAmount.jsx` | Presentational step of the booking wizard |
| `nexus-frontend/src/pages/Home.jsx` | Static content and animation |
| `nexus-frontend/src/pages/Gallery.jsx` | Static content |
| `nexus-frontend/src/pages/NotFound.jsx` | Static |
| `nexus-frontend/src/pages/admin/AdminLayout.jsx` | Shell and nav items |
| `nexus-frontend/src/pages/admin/AdminUsers.jsx` | Hard-coded table (data array becomes logic only if an endpoint is added) |
| `nexus-frontend/src/pages/admin/AdminSettings.jsx` | Static form |

### 4.2 Editable entirely (logic / config)

| File | Role |
|---|---|
| `nexus-frontend/src/hooks/useApi.js` | HTTP client — the API layer today |
| `nexus-frontend/src/context/AuthContext.jsx` | Session state, login, logout (the provider's JSX is a bare wrapper) |
| `nexus-frontend/vite.config.js`, `eslint.config.js`, `package.json` | Build/tooling (dependency changes follow rule 6) |
| `nexus-frontend/vercel.json` | Routing/deploy config — not UI, but changing it affects production; ask first |
| *New files* under `nexus-frontend/src/api/`, `src/hooks/`, `src/utils/`, `src/config.js` | Where extracted logic should go |

### 4.3 Mixed — logic region editable, JSX frozen

| File | Editable logic (lines) | Frozen from |
|---|---|---|
| `nexus-frontend/src/main.jsx` | Query client, boot-flag state `11-23` | Provider tree `25-35` (structure) |
| `nexus-frontend/src/App.jsx` | Imports `1-37`; which guard wraps which route | Route elements and Toaster options `39-221` (treat as frozen; guard logic changes go in `ProtectedRoute`) |
| `nexus-frontend/src/components/ProtectedRoute.jsx` | Guard decisions `8-9, 18-22` | Loading block `10-16` |
| `nexus-frontend/src/components/Layout.jsx` | `handleLogout`, `isAdmin` `9-24` | `26` onward |
| `nexus-frontend/src/components/StationGrid.jsx` | Fetch and selection `7-44` | `46` onward |
| `nexus-frontend/src/components/HUDTimePicker.jsx` | State and price calculation (above `return`, incl. `:73-79`) | JSX |
| `nexus-frontend/src/components/UpdateBooking.jsx` | Fetch, time conversion, submit `17-138` | `140` onward |
| `nexus-frontend/src/components/TournamentRegistrationModal.jsx` | State, prefill effect, submit `17-69` | `71` onward |
| `nexus-frontend/src/components/TournamentRegisterForm.jsx` | Submit handler `46-70` (schema **messages** `12-23` are visible text → frozen) | `72` onward |
| `nexus-frontend/src/pages/Login.jsx` | `7-28` (toast strings frozen) | `30` onward |
| `nexus-frontend/src/pages/Register.jsx` | `7-30` | `32` onward |
| `nexus-frontend/src/pages/Profile.jsx` | Client setup and handlers `18-62` | `64` onward |
| `nexus-frontend/src/pages/Booking.jsx` | State, auth effect, payload and submit `15-99` | `101` onward |
| `nexus-frontend/src/pages/BookingList.jsx` | Fetch and delete `19-64`; ownership computation `118-120` | `66` onward |
| `nexus-frontend/src/pages/Contact.jsx` | Submit handler `31-54` (schema messages `10-15` and `alert`/success strings are visible text → frozen) | `56` onward |
| `nexus-frontend/src/pages/Payment.jsx` | Handlers `8-41` (the `alert` text is visible → frozen) | `43` onward |
| `nexus-frontend/src/pages/Tournament.jsx` | State, generators, fetch, create `19-108` | `110` onward |
| `nexus-frontend/src/pages/TournamentDetails.jsx` | State, fetch, delete, update `21-124`, derived `134` | `126-132`, `136` onward |
| `nexus-frontend/src/pages/admin/AdminHUD.jsx` | Query `6-15`; value sources in `stats` `38-64` (labels and colours frozen) | `17-36`, `66` onward |
| `nexus-frontend/src/pages/admin/AdminBookings.jsx` | Fetch, cancel, team status, `allTeams` `15-117` | Loading block and `119` onward |
| `nexus-frontend/src/pages/admin/AdminMessages.jsx` | Fetch, mark read, delete `16-74` | `76` onward |

Line numbers are for frontend commit `8d178c2` and will drift; the rule above is what governs.
