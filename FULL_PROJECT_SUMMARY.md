# Full Project Summary

## Project

**A Human-Centered Redesign of an Online Class Representative Election System**

A full-stack, role-based election platform for managing class representative elections end-to-end: class setup, student onboarding, nominations, policy acceptance, voting, result publication, and audit visibility.

---

## Tech Stack

- **Backend:** Node.js, Express, MySQL (`mysql2`), JWT, bcrypt, Nodemailer, Multer
- **Frontend:** React (Vite), React Router, Axios, Tailwind CSS, Chart.js
- **Database:** MySQL schema in `DB.sql`

---

## Repository Structure

### Root

- `README.md` – setup and run instructions
- `DB.sql` – full schema and seed policy data
- `demo.csv` – sample CSV for student bulk import

### Backend (`backend/`)

- `server.js` – app bootstrap, middleware, routes, health checks, maintenance scheduler
- `config/` – app configuration and DB pool bootstrap
- `middleware/auth.js` – JWT + session validation + role guard
- `routes/` – API route definitions
- `controllers/` – business logic for all modules
- `utils/` – audit logger, token utilities, maintenance job
- `uploads/nominations/` – nomination upload storage path (present in project structure)

### Frontend (`frontend/`)

- `src/main.jsx` – app entry + providers
- `src/App.jsx` – top-level admin/public routes
- `src/pages/StudentArea.jsx` – student route tree
- `src/context/AuthContext.jsx` – auth/session state and auto-logout handling
- `src/api/` – axios API wrappers for backend endpoints
- `src/pages/admin/` – admin console pages
- `src/pages/student/` – student-facing pages
- `src/components/ui/` – reusable UI primitives

---

## Core Database Domain

### Identity and Access

- `Admin`
- `Student`
- `Session` (server-side session records tied to JWT claims)
- `OTP` (login/reset OTP lifecycle)

### Election Lifecycle

- `Class`
- `Election` (timeline windows, active/published flags)
- `Nomination` (status: `PENDING | APPROVED | REJECTED`)

### Policy and Compliance

- `Policy` (Nomination Policy, Voting Policy)
- `PolicyAcceptance` (per-user and per-election acceptance tracking)

### Voting Privacy Model

- `VotingToken` (one-time token issuance/use)
- `VoterStatus` (eligibility + has-voted state)
- `VoteAnonymous` (anonymous ballot records)

### Observability

- `AuditLog` (action, actor, outcome, details)

---

## End-to-End Functional Flows

## 1) Authentication

### Admin

1. Admin enters `adminId` + password.
2. Backend verifies credentials.
3. JWT issued with `sessionId` claim.
4. Session persisted in `Session` table.

### Student

1. Student enters `studentId` + password.
2. Backend verifies and sends OTP via email.
3. Student verifies OTP.
4. JWT issued + session persisted.
5. If `must_change_password = true`, student must set new password.

---

## 2) Authorization and Session Guard

- Protected endpoints require Bearer token.
- Middleware validates:
  1. JWT signature/expiry
  2. matching server session (`Session` table)
  3. role checks (`ADMIN` / `STUDENT`)

This creates a hybrid JWT + server-session control model.

---

## 3) Admin Workflows

- **Class Management:** create/list/delete classes, with force-delete behavior for linked data.
- **Student Management:** create/update/delete students, reset passwords, CSV bulk import.
- **Election Management:** create elections with strict timeline validation and overlap checks.
- **Notification Actions:** nomination-open, voting-open, results-published communication (email-based).
- **Nomination Review:** approve/reject nominations with optional rejection reason email.
- **Policy Management:** update canonical nomination/voting policy text and versioning.
- **Results Monitoring:** live turnout/final outcomes in admin dashboard views.
- **Audit Logs:** filter by date/user/role/action/outcome.

---

## 4) Student Workflows

- **Dashboard:** election and notification visibility.
- **Nominations:** election-specific nomination with policy acceptance gate.
- **Voting:**
  - check eligibility and vote status
  - accept voting policy
  - request token
  - cast vote once
- **Results:** view published election results.
- **Winner Certificate:** winner-only certificate fetch/render/download path.
- **Profile:** view profile and reset password via OTP.

---

## 5) Automation / Maintenance Job

A periodic background job handles:

- auto-rejecting pending nominations when voting starts
- OTP expiry and cleanup
- election auto-close/publish transitions
- election auto-activation and pre-creation of voting token + voter status records

---

## Security Measures Implemented

- `helmet` hardening middleware
- Global and OTP-specific rate limiting
- JWT verification + DB-backed session validation
- Role-based endpoint access control
- bcrypt password hashing
- OTP expiry/use controls
- policy acceptance enforcement before nomination/voting
- centralized audit logging

---

## Frontend Architecture Notes

- Route protection is handled by `ProtectedRoute` and `GuestRoute`.
- Auth state is centralized in `AuthContext` with localStorage persistence.
- API calls are standardized via `axiosInstance` + domain API modules.
- UI uses Tailwind and reusable UI primitives (`Button`, `Input`, `Modal`, etc.).

---

## Operational Notes

- Default local ports:
  - Backend: `5500`
  - Frontend: `5173`
- Vite proxy forwards `/api` to backend in development.
- SMTP settings are required for OTP and notification emails.
- `demo.csv` format is compatible with student bulk import expectations:
  - `name`, `email`, `date_of_birth`

---

## Summary

This project is a complete election management system with strong role separation (admin/student), policy-gated actions, anonymous voting design, and auditability. It includes both manual controls (admin operations) and automated lifecycle handling (maintenance job), making it suitable for structured academic election workflows.
