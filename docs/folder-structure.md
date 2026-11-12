# Folder Structure

A visual breakdown of the Nexus 2.0 workspace.

## Backend Architecture (`Nexus`)

```text
Nexus/
├── src/                   # TypeScript sources (compiled to dist/ by `npm run build`)
│   ├── server.ts          # Entry point: loads .env, validates it, connects MongoDB, listens
│   ├── app.ts             # Express application (middleware, routes, error handler)
│   ├── middleware.ts      # isLoggedIn, optionalAuth, isAdmin, currentUser
│   ├── config/            # env.ts (Zod-validated config), loadEnv.ts, origins.ts, rateLimits.ts
│   ├── controllers/       # Business logic: admin, booking, message, station, tournament, user
│   ├── models/            # Mongoose models: Booking, Message, Setup (legacy), Station, Tournament, User
│   ├── routes/            # Express routers (API endpoints)
│   ├── services/          # booking.service.ts (legacy, unused)
│   ├── types/             # domain.ts, requests.ts (z.infer), api.ts, express.d.ts (req.user)
│   ├── utils/             # validation, auth token/cookie, CSRF guard, error handler, ...
│   ├── validations/       # zodSchemas.ts
│   ├── init/              # seed scripts (local development only)
│   └── seedStations.ts    # idempotent station seed
├── tests/                 # Vitest + Supertest (TypeScript), in-memory MongoDB
├── tsconfig.json          # build config (tests/tsconfig.json type-checks the tests)
└── package.json           # dependencies & scripts
```

## Frontend Architecture (`nexus-frontend`)

```text
nexus-frontend/
├── src/
│   ├── components/    # Reusable UI blocks (Buttons, Cards, etc.)
│   ├── context/       # Global state (Auth Context)
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Full page views (Dashboard, Login, etc.)
│   ├── App.jsx        # Main routing & layout
│   └── main.jsx       # React DOM render entry point
```
