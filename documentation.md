# Technical Documentation: Smart Emergency Ambulance Dispatch System

This document contains the complete Software Requirements Specification (SRS), High-Level Design (HLD), Low-Level Design (LLD), API Specifications, Database Schema description, and Technical Viva Questions for the **Smart Emergency Ambulance Dispatch System** (branded as **SmartRescue**).

---

## 1. Project Synopsis

### Objective
The **Smart Emergency Ambulance Dispatch System** is a real-time, GPS-enabled platform built to minimize emergency response times. It bypasses traditional manual call center bottlenecks by instantly matching accident victims with the closest available ambulance drivers.

### Problem Statement
Traditional emergency dispatch relies on phone operators manually capturing locations, locating vehicles, calling drivers, and directing routes. This introduces human error, high response latency, and lack of visual tracking. SmartRescue resolves this by automating driver matching using geographical proximity and delivering real-time movement updates to victims.

### Key Outcomes
- **Instant Proximity Matching**: Haversine distance computations sort and alert the closest drivers within seconds.
- **Continuous GPS Streaming**: High-frequency location updates from active drivers mapped in real time.
- **Role Separation**: Tailored User and Driver dashboards optimized for stress-filled emergency environments.

---

## 2. Software Requirements Specification (SRS)

### 2.1 Functional Requirements

#### User (Citizen) Portal
1. **Secure Access**: Registration and Login using email, password, and phone number.
2. **Auto Geolocation**: Automatically request and extract browser GPS coordinates (Latitude, Longitude) on load.
3. **Nearby List**: Display a live sorted list of nearby online ambulances with type classification.
4. **Emergency Placement**: A single-click "DISPATCH NOW" trigger to broadcast coordinates.
5. **Real-time Tracking**: Live tracking of the assigned driver on a dashboard map, showing distance, ETA, and status.
6. **Communication**: Directly contact the assigned driver via phone link.
7. **System Notifications**: Receive in-app notifications on status changes (Assigned, Arrived, Completed).

#### Driver Portal
1. **Vehicle Registration**: Register with name, email, vehicle license plate number, and ambulance type.
2. **Availability Toggle**: Daily check-in switch to set status as Available (Online) or Unavailable (Offline).
3. **GPS Streamer**: Automatic background coordinate reporting (every 5-10 seconds) when online.
4. **Emergency Alerts**: Visual alerts with alarm sounds detailing accident coordinates and distance.
5. **Accept/Reject Controls**: Secure click-to-accept logic that locks the dispatch route.
6. **One-Tap Navigation**: Open Google Maps turn-by-turn directions using coordinate href routing.
7. **Mission Checklist**: Update mission states: Mark Arrival ("Arrived") and Mark Completion ("Completed").

### 2.2 Non-Functional Requirements
1. **Performance**: API response times under 200ms; WebSocket message broadcast delay under 50ms.
2. **Scalability**: Stateless JWT auth, Node.js event-loop clustering, and Postgres connection pooling.
3. **Security**: Bcrypt password hashing, input validation rules, and parameterized SQL query interfaces to prevent SQL injections.
4. **Usability**: Responsive, dark-themed CSS interfaces optimized for low-light situations.

---

## 3. High-Level Design (HLD)

### 3.1 Architecture Overview
The system uses an Event-Driven, Real-Time Architecture built on Node.js and PostgreSQL.

```
       +------------------+           +------------------+
       |   User Browser   |           |  Driver Browser  |
       |  (HTML5/CSS/JS)  |           |  (HTML5/CSS/JS)  |
       +--------+---------+           +--------+---------+
                |                              |
      HTTP / WebSockets              HTTP / WebSockets
                |                              |
                v                              v
       +-------------------------------------------------+
       |             Fastify Application Server          |
       |  +-------------------------------------------+  |
       |  |          Fastify-JWT Middleware           |  |
       |  +-------------------------------------------+  |
       |  |        Socket.IO WebSockets Server        |  |
       |  +-------------------------------------------+  |
       +--------+------------------------------+---------+
                |                              |
          SQL Queries                      Directions
                |                              |
                v                              v
       +------------------+           +------------------+
       | Neon PostgreSQL  |           |   Google Maps    |
       |     Database     |           |   Navigation     |
       +------------------+           +------------------+
```

### 3.2 Key Architecture Patterns
- **Stateless HTTP REST APIs**: For authentication, dashboard checks, and mission updates.
- **WebSocket Rooms**: Dynamic socket grouping where:
  - Users join room `user_<userId>`.
  - Drivers join room `driver_<driverId>`.
  - Available online drivers join `available_drivers`.
  - Active tracking establishes a connection room `track_driver_<driverId>`.
- **Serverless PostgreSQL**: Managed Neon cluster utilizing SSL-secured pooling client.

---

## 4. Low-Level Design (LLD)

### 4.1 Database Entity-Relationship Mappings
```
 +---------------+         +---------------+
 |     USERS     |         |    DRIVERS    |
 +---------------+         +---------------+
 | id (PK)       |1       1| id (PK)       |
 | email (UQ)    +-------->| user_id (FK)  |
 | role (enum)   |         | vehicle_no    |
 +---------------+         +-------+-------+
                                   |1
                                   |
                                   |1 (PK, FK)
                           +-------v--------+
                           |DRIVER_LOCATIONS|
                           +----------------+
                           | driver_id (PK) |
                           | latitude       |
                           | longitude      |
                           +----------------+
```

### 4.2 Module Flowcharts & Algorithms
- **Haversine Distance Formulation**:
  $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$
  Where $R = 6371\text{ km}$, $\phi$ is latitude, and $\lambda$ is longitude in radians.

- **Emergency Alert Broadcast Lifecycle**:
  1. Citizen clicks dispatch button $\to$ Backend writes `pending` request record in `emergency_requests`.
  2. Backend queries all drivers where `is_available = true`.
  3. Haversine function calculates distance to each driver.
  4. Server broadcasts `emergency_alert` with user coordinates and distance checklist to `available_drivers` room.
  5. The first driver client to click Accept submits a transaction update (`status = accepted`, `is_available = false`).
  6. Server broadcasts `request_accepted` with driver details to `user_<userId>` and `request_closed` to `available_drivers`.

---

## 5. API Documentation

### 5.1 Registration Endpoint
- **Method**: `POST`
- **Endpoint**: `/api/auth/register`
- **Request Body**:
  ```json
  {
    "name": "Alex Mercer",
    "email": "alex@rescue.com",
    "password": "securepassword123",
    "phone": "+919876543210",
    "role": "driver",
    "vehicle_number": "KA-03-P-7777",
    "ambulance_type": "Advanced Cardiac Life Support (ACLS)"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 12,
      "name": "Alex Mercer",
      "email": "alex@rescue.com",
      "role": "driver",
      "driverId": 4,
      "vehicleNumber": "KA-03-P-7777",
      "ambulanceType": "Advanced Cardiac Life Support (ACLS)"
    }
  }
  ```
- **Status Codes**:
  - `201`: Account created successfully.
  - `400`: Invalid inputs or missing fields.
  - `409`: Conflict (Email or vehicle plate already registered).

### 5.2 Login Endpoint
- **Method**: `POST`
- **Endpoint**: `/api/auth/login`
- **Request Body**:
  ```json
  {
    "email": "alex@rescue.com",
    "password": "securepassword123"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 12,
      "name": "Alex Mercer",
      "email": "alex@rescue.com",
      "role": "driver",
      "driverId": 4,
      "isAvailable": false
    }
  }
  ```
- **Status Codes**:
  - `200`: Login successful.
  - `401`: Unauthorized (Invalid password or email).

### 5.3 Fetch Nearby Ambulances (Citizen)
- **Method**: `GET`
- **Endpoint**: `/api/user/ambulances`
- **Query Parameters**: `latitude=12.9715&longitude=77.5945`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "ambulances": [
      {
        "driverId": 4,
        "driverName": "Alex Mercer",
        "driverPhone": "+919876543210",
        "vehicleNumber": "KA-03-P-7777",
        "ambulanceType": "Advanced Cardiac Life Support (ACLS)",
        "latitude": 12.9765,
        "longitude": 77.5945,
        "distanceKm": 0.55
      }
    ]
  }
  ```

### 5.4 Update Availability (Driver)
- **Method**: `PUT`
- **Endpoint**: `/api/driver/availability`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "is_available": true
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "is_available": true
  }
  ```

### 5.5 Perform Request Action (Accept/Arrive/Complete)
- **Method**: `PUT`
- **Endpoint**: `/api/emergency/action/:id`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "action": "accept"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "status": "accepted",
    "message": "Emergency request accepted successfully"
  }
  ```

---

## 6. Database Documentation

### 6.1 Entity Descriptions & Mappings
The database consists of 6 tables. Refer to the migration script `migrations.sql` for definitions.

#### Table: `users`
| Column | DataType | Constraints | Description |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | Unique identifier for users |
| `name` | VARCHAR(100) | NOT NULL | User's full name |
| `email` | VARCHAR(150) | UNIQUE, NOT NULL | Registration email address |
| `password`| VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| `phone` | VARCHAR(20) | NOT NULL | Contact number |
| `role` | user_role | DEFAULT 'user' | ENUM: `'user'`, `'driver'` |
| `created_at`| TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

#### Table: `drivers`
| Column | DataType | Constraints | Description |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | Unique driver identifier |
| `user_id` | INTEGER | UNIQUE, REFERENCES users(id) | Associated user reference |
| `vehicle_number`| VARCHAR(50)| UNIQUE, NOT NULL | License plate registration |
| `ambulance_type`| VARCHAR(50)| NOT NULL | Classification type |
| `is_available` | BOOLEAN | DEFAULT FALSE | Available for dispatch flag |

---

## 7. Viva Questions & Answers (Study Guide)

#### Q1: What is Fastify and why is it preferred over Express for this project?
**Answer**: Fastify is a high-performance web framework for Node.js. It features extremely low overhead (up to 5x faster than Express), schema-based validation (which speeds up serialization and payload checks), and native support for modern JavaScript async/await patterns.

#### Q2: How does the system handle database concurrency if two drivers click "Accept" on the same alert at the exact same moment?
**Answer**: We implement transaction-level concurrency control in our `accept` route. Using SQL updates inside a transaction:
`UPDATE emergency_requests SET status = 'accepted' WHERE id = $3 AND status = 'pending'`
If two drivers execute this query concurrently, the first database transaction to write will succeed. The second transaction will return 0 affected rows because the status is no longer `'pending'`. The database rollback handles this safely and the API returns a `400 Bad Request` to the second driver.

#### Q3: Why is the Haversine formula preferred over simple Euclidean (Pythagorean) distance for geolocation lookup?
**Answer**: The Earth is a sphere (an oblate spheroid), not a flat plane. Euclidean distance fails over larger distances because lines of longitude converge at the poles. The Haversine formula calculates the great-circle distance between two points on a sphere, yielding accurate real-world travel offsets.

#### Q4: How are socket connection scopes secured in this system?
**Answer**: Clients authenticate using a JWT token via standard API login. When establishing a WebSocket connection, they emit a `join` event containing their user ID. In production, we add a Socket.IO connection middleware that reads the query token or header cookie, calling `jwt.verify(token)` before permitting socket packets to send.

#### Q5: How is the database index optimization configured here?
**Answer**: We declare indexes on highly queried columns:
- `idx_users_email` to optimize login checks.
- `idx_drivers_availability` to optimize listing online drivers.
- `idx_emergency_requests_status` to scan active dispatches.
- A conditional index `idx_notifications_user_unread` (`WHERE is_read = FALSE`) to optimize reading unread notification records.
