# Prerequisites & Installation

Follow these instructions to set up and run the Nexus 2.0 environment locally.

## Prerequisites

Ensure you have the following installed:
- **Node.js** (v16 or higher recommended)
- **npm** (comes with Node.js)
- **MongoDB Atlas Account** (or a local MongoDB instance)

---

## 1. Backend Setup (Nexus Core)

### Clone the Repository
```bash
git clone https://github.com/Jatin29yadav/Nexus.git
cd Nexus
```

### Install Dependencies
```bash
npm install
```

### Configure Environment Variables
Create a `.env` file in the root of the backend directory (see [Environment Variables Guide](env-variables.md) for details).
```env
PORT=3005
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

### Run the Server
The backend is TypeScript (`src/`), compiled to `dist/`.
```bash
# Development mode (tsx restarts on change, no build needed)
npm run dev

# Production mode: compile, then run the compiled server
npm run build
npm start
```

On Render: build command `npm ci --include=dev && npm run build`, start command `npm start`.
(`--include=dev` because TypeScript is a devDependency and npm skips those when `NODE_ENV=production`.)

---

## 2. Frontend Setup (Nexus React Client)

### Clone the Repository
```bash
git clone https://github.com/Jatinyadav29/nexus-frontend.git
cd nexus-frontend
```

### Install Dependencies
```bash
npm install
```

### Configure Environment Variables
Create a `.env` file in the root of the frontend directory.
```env
VITE_API_BASE_URL=http://localhost:3005/api
```

### Run the Client
```bash
npm run dev
```
The client should now be accessible at `http://localhost:5173`.
