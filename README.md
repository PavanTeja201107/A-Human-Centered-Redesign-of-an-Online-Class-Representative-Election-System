# A-Human-Centered-Redesign-of-an-Online-Class-Representative-Election-System

A full-stack web application for managing class representative elections, nominations, voting, and results with robust admin and student flows.

---

## Tech Stack

- **Backend:** Node.js, Express, MySQL, JWT, bcrypt, nodemailer
- **Frontend:** React (Vite), React Router, Axios, Tailwind CSS

---

## Setup Instructions

### 1. Clone the repository

```sh
git clone git remote add origin https://github.com/PavanTeja201107/A-Human-Centered-Redesign-of-an-Online-Class-Representative-Election-System.git
cd Online-CRES
```

### 2. Environment Variables

Create two `.env` files:

- `backend/.env`
- `frontend/.env` (optional, only if you want to override Vite defaults)

#### backend/.env example:

```
PORT=5500
FRONTEND_ORIGIN=http://localhost:5173

# MySQL
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=online_cres

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1h

# Email/SMTP (for OTP and notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
OTP_EMAIL_FROM="Election System <noreply@example.com>"
```

#### frontend/.env (optional)

```
VITE_API_BASE_URL=http://localhost:5500/api
```

---

### 3. Database Setup

- Import the provided `DB.sql` into your MySQL server:

```sh
mysql -u your_mysql_user -p online_cres < DB.sql
```

---

### 4. Install Dependencies

#### Backend

```sh
cd backend
npm install
```

#### Frontend

```sh
cd ../frontend
npm install
```

---

### 5. Running the App

#### Start Backend

```sh
cd backend
npm run dev
# or
node server.js
```

#### Start Frontend

```sh
cd ../frontend
npm run dev
```

- Backend: http://localhost:5500
- Frontend: http://localhost:5173

## .env Field Reference

| Field           | Description                              |
| --------------- | ---------------------------------------- |
| PORT            | Backend server port (default: 5500)      |
| FRONTEND_ORIGIN | Allowed frontend URL for CORS            |
| DB_HOST         | MySQL host                               |
| DB_USER         | MySQL username                           |
| DB_PASSWORD     | MySQL password                           |
| DB_NAME         | MySQL database name                      |
| JWT_SECRET      | Secret for JWT signing                   |
| JWT_EXPIRES_IN  | JWT token expiry (e.g., 1h)              |
| SMTP_HOST       | SMTP server host                         |
| SMTP_PORT       | SMTP server port (e.g., 587)             |
| SMTP_USER       | SMTP username                            |
| SMTP_PASS       | SMTP password                            |
| OTP_EMAIL_FROM  | From address for OTP/notification emails |

