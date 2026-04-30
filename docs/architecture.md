# System Architecture

Nexus 2.0 is built on the MERN stack (React, Node.js, Express, MongoDB).

## Component Breakdown

### 1. Frontend (Client Interface)
- **Technology**: React.js (bootstrapped with Vite)
- **Role**: Provides a dynamic, responsive interface for users to view stations, book PCs, and for admins to manage the center.
- **Repository**: [Nexus React Client](https://github.com/Jatinyadav29/nexus-frontend)

### 2. Backend (Core API Engine)
- **Technology**: Node.js & Express.js
- **Role**: Serves as the central logic layer. Handles authentication, authorization (JWT), booking logic, and tournament management.
- **Repository**: [Nexus Backend](https://github.com/Jatin29yadav/Nexus)

### 3. Database
- **Technology**: MongoDB Atlas (Cloud)
- **Role**: Stores relational data mappings (e.g., Users, Bookings, Stations, Tournaments).

## Communication & Data Flow

1. **Client Request**: The React frontend initiates an HTTP request to the Express backend.
2. **Authentication**: For protected routes, the client attaches a JSON Web Token (JWT) in the cookies/headers.
3. **Business Logic**: The backend processes the request (e.g., checking station availability).
4. **Database Query**: The backend interacts with MongoDB Atlas using Mongoose schemas.
5. **JSON Response**: Data is returned to the client in standard JSON format.
