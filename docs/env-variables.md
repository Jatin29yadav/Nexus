# Environment Variables Guide

Nexus 2.0 requires several environment variables to be set for full functionality. Create a `.env` file in the root of the `Nexus` directory.

## Backend Environment Variables

| Variable | Description | Example Value | Required |
| :--- | :--- | :--- | :--- |
| `PORT` | The port number the Express server will listen on. | `3005` | No (Defaults to 3005) |
| `MONGO_URI` | MongoDB Atlas connection string for the database. | `mongodb+srv://...` | **Yes** |
| `JWT_SECRET` | Secret key used to sign JSON Web Tokens for authentication. | `supersecretkey123` | **Yes** |
| `CLIENT_URL` | The URL of the frontend client (used to configure CORS). | `http://localhost:5173` | **Yes** |
| `NODE_ENV` | The runtime environment mode. | `development` or `production` | No |

## Sample `.env` File

```env
PORT=3005
MONGO_URI=mongodb+srv://admin:password@cluster0.mongodb.net/nexus
JWT_SECRET=my_secret_jwt_key
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

> [!WARNING]
> Never commit your `.env` file to version control. It is ignored by default via `.gitignore`.
