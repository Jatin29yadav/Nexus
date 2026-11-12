# Environment Variables Guide

Nexus 2.0 requires several environment variables to be set for full functionality. Create a `.env` file in the root of the `Nexus` directory.

## Backend Environment Variables

| Variable | Description | Example Value | Required |
| :--- | :--- | :--- | :--- |
| `MONGO_URI` | MongoDB connection string (secret). | `mongodb+srv://...` | **Yes** |
| `JWT_SECRET` | Signs the auth cookie JWT (secret). At least 32 random characters; the server refuses to start otherwise. | *(generate, never copy an example)* | **Yes** |
| `FRONTEND_URL` | Browser origin(s) of the frontend allowed by CORS and the CSRF check. Comma-separated for several. `CLIENT_URL` (old name) is still read as a fallback. | `http://localhost:5173` | **Yes in production** |
| `NODE_ENV` | `production` enables Secure cookies, removes the localhost origin and trusts the proxy. | `development` or `production` | No |
| `PORT` | Port the server listens on. | `3005` | No (defaults to 3005) |
| `COOKIE_SAMESITE` | Auth cookie SameSite: `lax`, `strict` or `none`. | `lax` | No (`none` in production, `lax` otherwise) |
| `TRUST_PROXY` | Number of reverse-proxy hops in front of the app. | `1` | No (1 in production, 0 otherwise) |
| `SEED_USER_PASSWORD` | Password for the sample users created by `src/init/index.ts` (seed scripts only). | – | No (random per run) |
| `ALLOW_PRODUCTION_SEED` | Must be `yes` for a seed script to run with `NODE_ENV=production`. | – | No |

The authoritative list is [`.env.example`](../.env.example) (names only); a test keeps it in sync with the code.

## Sample `.env` File

```env
PORT=3005
MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<at least 32 random characters>
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> [!WARNING]
> Never commit your `.env` file to version control. It is ignored by default via `.gitignore`.
