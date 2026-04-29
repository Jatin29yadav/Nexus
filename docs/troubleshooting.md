# Troubleshooting & FAQ

Common issues encountered during setup and how to resolve them.

## 1. MongoDB Connection Error

**Error**: `MongoDB Connection Error: ...`
- **Cause**: Incorrect `MONGO_URI` in your `.env` file or your IP address is not whitelisted in MongoDB Atlas.
- **Solution**:
  1. Double-check your `MONGO_URI` in `.env`.
  2. Log in to MongoDB Atlas, go to **Network Access**, and ensure your current IP address is added (or allow access from anywhere `0.0.0.0/0` for development).

## 2. Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3005`
- **Cause**: Another process is running on the same port.
- **Solution**:
  - Change the `PORT` variable in your `.env` file (e.g., `PORT=3006`).
  - Or kill the process using the port (e.g., `npx kill-port 3005`).

## 3. CORS Policy Blocking Requests

**Error**: `Access to fetch at '...' from origin '...' has been blocked by CORS policy`
- **Cause**: The `CLIENT_URL` in the backend `.env` does not match the URL your React app is running on.
- **Solution**:
  - Update `CLIENT_URL` in `Nexus/.env` to match your frontend (e.g., `http://localhost:5173`).
  - Restart the backend server.

## 4. JWT Verification Failed / Unauthorized

**Error**: `401 Unauthorized` on protected routes.
- **Cause**: Invalid or expired token, or the `JWT_SECRET` was changed.
- **Solution**:
  - Log out and log back in to generate a fresh token.
  - Ensure `JWT_SECRET` is identical across environments.
