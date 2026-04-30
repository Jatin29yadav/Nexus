# API Reference

All requests should be made to the base URL: `http://localhost:3005/api` (or the deployed URL).

## Authentication

Requests requiring authentication expect a JWT token to be provided in the `token` cookie.

### 1. Register User
- **Method**: `POST`
- **Endpoint**: `/users/register`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "username": "johndoe",
    "email": "john@example.com",
    "password": "securepassword",
    "phone": "1234567890"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "user": {
      "_id": "65a...",
      "username": "johndoe",
      "email": "john@example.com"
    }
  }
  ```

### 2. Login User
- **Method**: `POST`
- **Endpoint**: `/users/login`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "john@example.com",
    "password": "securepassword"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "_id": "65a...",
      "username": "johndoe",
      "email": "john@example.com"
    }
  }
  ```

### 3. Get User Profile
- **Method**: `GET`
- **Endpoint**: `/users/profile`
- **Auth Required**: Yes
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "_id": "65a...",
      "username": "johndoe",
      "email": "john@example.com",
      "role": "User",
      "wishlist": [],
      "bookings": []
    }
  }
  ```

## Bookings

### 1. Create Booking
- **Method**: `POST`
- **Endpoint**: `/bookings`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "stationId": "PC-05",
    "startTime": "2026-04-29T12:00:00Z",
    "endTime": "2026-04-29T14:00:00Z"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "booking": {
      "_id": "65b...",
      "user": "65a...",
      "stationId": "PC-05",
      "startTime": "...",
      "endTime": "..."
    }
  }
  ```

## Admin Endpoints

Requires the user to have `role: "Admin"`.

### 1. Get Dashboard Data
- **Method**: `GET`
- **Endpoint**: `/admin/dashboard`
- **Auth Required**: Yes (Admin)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "totalUsers": 15,
      "totalBookings": 45,
      "activeStations": 10
    }
  }
  ```
