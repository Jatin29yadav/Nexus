# Folder Structure

A visual breakdown of the Nexus 2.0 workspace.

## Backend Architecture (`Nexus`)

```text
Nexus/
├── controllers/       # Core business logic for handling requests
│   ├── admin.js
│   ├── booking.js
│   ├── message.js
│   ├── station.js
│   ├── tournament.js
│   └── user.js
├── models/            # Mongoose schemas for MongoDB mappings
│   ├── Booking.js
│   ├── Message.js
│   ├── Setup.js
│   ├── Station.js
│   ├── Tournament.js
│   └── User.js
├── routes/            # Express route definitions (API endpoints)
│   ├── admin.js
│   ├── booking.js
│   ├── message.js
│   ├── station.js
│   ├── tournament.js
│   └── user.js
├── utils/             # Helper functions and custom error handlers
├── app.js             # Express application setup (middleware, routes)
├── server.js          # Server entry point & database connection
└── package.json       # Project dependencies & scripts
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
