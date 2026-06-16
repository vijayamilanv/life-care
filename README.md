# Smart Emergency Ambulance Dispatch System

Branded as **SmartRescue**, this is a production-ready, real-time emergency ambulance dispatch platform that connects accident victims with nearby available ambulance drivers.

---

## 🚀 Key Features

* **Citizen Dashboard**:
  - Request emergency response with automated GPS coordinate sharing.
  - Live track dispatch status, assigned vehicle info, and computed ETA.
  - Direct turn-by-turn navigation link and quick dial triggers.
  - View live counts and lists of nearby online ambulances sorted by proximity.

* **Driver Dashboard**:
  - Daily check-in console to toggle online availability status.
  - High-frequency GPS coordinates streaming.
  - Sound-alarmed emergency alerts detailing coordinates and distance.
  - One-tap directions launcher using Google Maps navigation paths.
  - Simple controls to signal arrival at scene and trip completion.

---

## 🛠️ Technology Stack

* **Frontend**: HTML5, CSS3 (Premium dark-themed glassmorphism), Vanilla JavaScript.
* **Backend**: Fastify (Node.js) – chosen for microsecond-scale performance and low memory footprints.
* **Database**: Neon PostgreSQL (Serverless database connection).
* **Real-time Engine**: WebSockets (via Socket.IO).
* **Maps**: Google Maps via coordinates-based directions routing (no external API Key dependency).

---

## 📂 Project Directory Structure

```
├── src/
│   ├── config/
│   │   └── db.js            # Neon PostgreSQL client initialization
│   ├── middleware/
│   │   └── auth.js          # Fastify JWT security hooks
│   ├── routes/
│   │   ├── auth.js          # Authentication (Login, Register)
│   │   ├── driver.js        # Driver actions & location updates
│   │   ├── user.js          # Citizen nearby ambulance checks
│   │   ├── emergency.js     # Mission dispatches & actions
│   │   └── notifications.js # System alerts logs
│   ├── sockets/
│   │   └── socketHandler.js # Socket.IO connection and location broadcasting
│   └── app.js               # Main Fastify application configuration
├── public/
│   ├── css/
│   │   └── styles.css       # Premium styles (dark-theme glassmorphism)
│   ├── js/
│   │   ├── api.js           # Frontend client API wrappers
│   │   ├── socket.js        # Frontend Socket.IO client setup
│   │   └── app.js           # Frontend single-page app controller
│   └── index.html           # Unified frontend layout
├── tests/
│   ├── integration.test.js  # Fastify router endpoint tests
│   └── haversine.test.js    # Geographical distance unit tests
├── migrations.sql           # Database schema SQL migration commands
├── run-migration.js         # Migration execution automation script
├── package.json             # App scripts and dependencies
└── README.md                # System documentation
```

---

## 💻 Local Setup & Development

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).

### 2. Configure Environment variables
Create a `.env` file in the root directory:
```env
PORT=3000
DATABASE_URL=postgresql://neondb_owner:npg_TH39aZhRKFrb@ep-empty-smoke-anepi8td-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET=super_secret_emergency_jwt_token_12345!
NODE_ENV=development
```

### 3. Install dependencies
```bash
npm install
```

### 4. Run database migrations
Executes the schema scripts against your Neon PostgreSQL instance:
```bash
node run-migration.js
```

### 5. Start the Application
* **Development mode (Auto restart)**:
  ```bash
  npm run dev
  ```
* **Production mode**:
  ```bash
  npm start
  ```

---

## 🧪 Testing

Execute automated unit and integration tests:
```bash
npm test
```

---

## 🌐 Deployment Guide

### 1. Database (Neon PostgreSQL)
1. Register/Login on [Neon](https://neon.tech/).
2. Create a new PostgreSQL database.
3. Retrieve your connection string.
4. Set up tables by running the local migration script or executing the SQL from `migrations.sql` in the Neon SQL Console.

### 2. Backend (Render / Railway)
1. Push this repository to GitHub.
2. Link your repository on [Render](https://render.com/) or [Railway](https://railway.app/).
3. Choose **Web Service** environment.
4. Configure Build Command: `npm install`
5. Configure Start Command: `npm start`
6. Add Environment Variables:
   - `PORT=8080` (or leave blank; Render handles port assignments automatically)
   - `DATABASE_URL` = `<your_neon_connection_url>`
   - `JWT_SECRET` = `<your_secure_random_string>`
   - `NODE_ENV` = `production`
7. Ensure your host is set to `0.0.0.0` (handled by Fastify's listen parameters in `src/app.js`).

### 3. Frontend (Vercel / Netlify)
Since the app serves static resources from the `public/` directory via the Fastify server, the easiest way to run the platform is as a unified Node.js monolithic app on Render/Railway. 

If you prefer to deploy the frontend separately on Vercel/Netlify:
1. Extract the contents of the `public/` directory.
2. Edit `public/js/api.js` to point `API_URL` to your deployed backend domain (e.g. `https://your-backend.render.com`).
3. Deploy the `public/` folder as a static site on Vercel or Netlify.
