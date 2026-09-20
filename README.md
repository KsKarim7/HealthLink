# HealthLink — Doctor-Patient Accountability System

Clinic front-desk tool for recording patient visits with automatic new/existing detection and morning/evening shift filtering.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind + ShadCN-style components
- **Backend:** Node + Express + MongoDB + JWT (HttpOnly cookies)

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB running locally (or update `MONGODB_URI` in `backend/.env`)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # if .env doesn't exist
npm run seed           # creates doctor/doctor123 and reception/reception123
npm run dev            # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### Default logins

| Username   | Password      | Role         |
|------------|---------------|--------------|
| doctor     | doctor123     | doctor       |
| reception  | reception123  | receptionist |

## Features

- JWT auth with HttpOnly cookies
- Automatic new (৳800) vs existing (৳300) patient detection
- Morning/Evening shift filter with tap-to-deactivate → All
- Responsive: table (md+), cards (mobile), Dialog/Drawer for Add Patient
- Server-side fee computation, atomic patient ID generation, Asia/Dhaka timezone
- Household phone support with multi-candidate picker

See `site-plan-v2.md` for the full specification.
