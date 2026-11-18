# TaskUpCard

Full-stack task management and freelancer collaboration platform built with **JavaScript (ES6+)**, **Express.js**, **Socket.IO**, **React**, **FullCalendar**, **Chart.js**, **Neon Serverless PostgreSQL**, and **Neon S3-Compatible Object Storage**.

## Architecture

- **Frontend (`src/`)**: Pure JavaScript + React 19 + Tailwind CSS v4 frosted glass UI, FullCalendar (Month / Week / Day / List views), Chart.js (`react-chartjs-2`), and Socket.IO client.
- **Backend (`server.js`, `server/`)**: Express.js REST API, JWT authentication, `bcryptjs` password hashing, Multer file upload validation, Nodemailer email dispatch, Socket.IO real-time room sync, and role-based access control (`super_admin`, `project_manager`, `freelancer`).
- **Database (`server/db/`)**: Normalized PostgreSQL schema on Neon Serverless PostgreSQL (`schema.sql`, `migrate.js`, `seed.js`).
- **Object Storage (`server/services/storage.js`)**: Deliverables and attachments are stored in Neon S3-compatible object storage (with local fallback outside the public web root), while metadata is stored in PostgreSQL with permission-verified downloads.

## Installation & Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL`, `JWT_SECRET`, `SUPER_ADMIN_PASSWORD`, and your `AWS_*` S3 storage credentials in `.env`.
3. Run database schema migrations and seed sample data:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. Start the development server (port `3000`):
   ```bash
   npm run dev
   ```

## Seeded Accounts

Set `SUPER_ADMIN_PASSWORD` in `.env` or your deployment environment before starting the server or running the seed command. The only seeded Super Admin is:

| Role | Name | Email |
| :--- | :--- | :--- |
| Super Admin | Sai Deepak | `sai.deepak@iamneo.ai` |

The demo project manager and freelancer accounts use `TaskUp2026!` for sample data. Change or remove these demo credentials before production use.

| Role | Name | Email |
| :--- | :--- | :--- |
| Project Manager | Elena Rostova | `manager@taskupcard.com` |
| Freelancer | Clara Chen | `clara@studio-chen.io` |
| Freelancer | Arthur Sterling | `arthur@sterlingdev.net` |
| Freelancer | Nadia Al-Mansoor | `nadia@trainerhub.org` |

Any Super Admin can create additional **Super Admins**, **Project Managers**, or **Freelancers**, edit roles, deactivate/reactivate accounts, or permanently delete users from **Team & Freelancers**.

## Deploying to Render

This repository includes a `render.yaml` Blueprint for one-click or manual deployment on **Render** as a single full-stack Web Service (Express + Socket.IO + Vite production bundle).

### Render Web Service Settings

- **Environment / Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`

### Required Render Environment Variables

| Variable | Value |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your Neon PostgreSQL connection string (`?sslmode=require`) |
| `JWT_SECRET` | Strong random secret (auto-generated if using `render.yaml`) |
| `JWT_EXPIRES_IN` | `7d` |
| `APP_URL` | Your Render service URL (e.g., `https://taskupcard.onrender.com`) |
| `AWS_ENDPOINT_URL_S3` | Your Neon S3 storage endpoint URL |
| `AWS_ACCESS_KEY_ID` | Your Neon S3 access key ID |
| `AWS_SECRET_ACCESS_KEY` | Your Neon S3 secret access key |
| `AWS_REGION` | `us-east-1` |
| `S3_BUCKET` | `assets` |

Optional SMTP variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) can also be added for real email notifications.
