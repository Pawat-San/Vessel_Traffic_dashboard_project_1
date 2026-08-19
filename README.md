# 🚢 Vessel Traffic Dashboard

An enterprise-grade, real-time dashboard for tracking vessel arrivals, berthing, and departures — think of it as an **airport departure board, but for ships**. 
Built as a modular Node.js/Express monolith with role-based access control, full audit logging, and portable database support (SQLite for local dev, PostgreSQL/Supabase for production).

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Overview](#api-overview)
- [Roles & Permissions](#roles--permissions)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [License](#license)

## Overview

The Vessel Traffic Dashboard gives port operations teams a single, live view of every vessel's status — replacing scattered spreadsheets and phone calls. Users sign in, see vessel schedules (ETA / ETB / ETD) and terminal assignments in real time, and act on that data according to their role. Departed vessels roll off into a searchable archive automatically, and every change to the data is recorded in an audit trail.

## Features

- 📊 **Live dashboard** — vessel list with status summary counters (arriving, berthed, departed, etc.)
- 🔐 **JWT authentication** with refresh tokens and forced password change on first login / admin reset
- 👥 **Role-based access control** — Viewer, Operator, Admin, Superadmin, each scoped to specific actions
- 🛳️ **Vessel CRUD** — create, update, delete, and bulk CSV import
- 🏗️ **Terminal management** — admin-managed berth/terminal reference data
- 🗄️ **Automatic archiving** — departed vessels move to a denormalized archive table, kept readable even if terminal/user master data later changes
- 📝 **Audit logging** — every write records who changed what, when, and from which IP
- 📄 **CSV export / import** for vessel data
- 📘 **OpenAPI/Swagger docs** served from the running app
- 🐳 **Dockerized**, with CI (lint → audit → test → build) via GitHub Actions

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20, Express 4 |
| Database | Knex 3 (query builder/migrations) · better-sqlite3 (dev) · PostgreSQL via `pg` (prod, Supabase) |
| Auth & Security | JSON Web Tokens, `@node-rs/argon2` (+ bcryptjs fallback), Helmet, CORS, custom rate limiter, cookie-parser |
| Validation | Zod |
| API Docs | swagger-ui-express + OpenAPI spec (`docs/openapi.yaml`) |
| Logging | Winston + daily rotating file transport |
| Frontend | Vanilla HTML/CSS/JavaScript (no framework, no build step) |
| Testing | Jest + Supertest |
| Quality | ESLint |
| Infra | Docker, docker-compose, GitHub Actions CI, Render (hosting), Supabase (managed Postgres) |

## Architecture

The backend follows a **modular monolith** pattern. Each domain — `auth`, `users`, `vessel`, `terminal`, `archive` — is a self-contained module with its own routes, controller, service, and repository layers:

```
Request → Middleware chain → Controller → Service → Repository → Knex → SQLite / PostgreSQL
          (rate limit, helmet,
           CORS, auth, RBAC,
           Zod validation)
```

This keeps business logic independent of the database driver, so the same migrations and application code run against SQLite locally and PostgreSQL in production.

## Getting Started

### Prerequisites

- Node.js ≥ 20
- npm

### Installation

```bash
git clone https://github.com/Pawat-San/Vessel_Traffic_dashboard_project_1.git
cd Vessel_Traffic_dashboard_project_1
npm install
cp .env.example .env
```

Edit `.env` and set at minimum `JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `SUPERADMIN_USERNAME`, and `SUPERADMIN_PASSWORD`.

### Run database migrations & seed

```bash
npm run db:migrate
npm run db:seed
```

### Start the app

```bash
npm run dev     # local development with hot reload
npm start        # production
```

The app runs on `http://localhost:3000` by default. API docs are served via Swagger UI once the app is running.

### Run with Docker

```bash
docker-compose up --build
```

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3000`) |
| `DB_CLIENT` | `sqlite` (local dev) or `pg` (production) |
| `DB_PATH` | SQLite file path (when `DB_CLIENT=sqlite`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `DB_SSL` | PostgreSQL connection (when `DB_CLIENT=pg`) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` / `COOKIE_SECRET` | Auth secrets — must be changed in production |
| `CORS_ORIGIN` | Allowed origin for CORS |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Rate limiter config |
| `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` | Bootstrap superadmin account (required on first run) |
| `SEED_DEMO_ACCOUNTS` | Optional demo accounts for local dev only |

> ⚠️ Never commit real secrets. Set production values only in your deployment environment (e.g. Render's dashboard).

## Available Scripts

| Script | Description |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with nodemon (hot reload) |
| `npm test` | Run the Jest test suite |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run db:migrate` | Run Knex migrations |
| `npm run db:seed` | Run Knex seeds |
| `npm run db:reset` | Delete local SQLite DB, re-migrate, and re-seed |
| `npm run lint` | Run ESLint |

## API Overview

Full interactive documentation is available via Swagger UI at `/api-docs` when the app is running (spec at `docs/openapi.yaml`). Core endpoints:

| Resource | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` |
| **Vessels** | `GET /api/vessels`, `GET /api/vessels/summary`, `GET /api/vessels/:id`, `POST /api/vessels`, `POST /api/vessels/import`, `PUT /api/vessels/:id`, `DELETE /api/vessels/:id`, `POST /api/vessels/archive` |
| **Terminals** | `GET /api/terminals`, `GET /api/terminals/:id`, `POST /api/terminals`, `PUT /api/terminals/:id`, `DELETE /api/terminals/:id` |
| **Archive** | `GET /api/archive`, `POST /api/archive/purge` |
| **Users** | `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`, `POST /api/users/:id/reset-password`, `POST /api/users/me/change-password` |

## Roles & Permissions

| Role | Permissions |
|---|---|
| **Viewer** | Read-only access to vessels, terminals, and archive |
| **Operator** | Everything a Viewer can do, plus create/update vessels and bulk import |
| **Admin** | Everything an Operator can do, plus delete vessels, manage terminals, manage users, purge archive |
| **Superadmin** | Full admin rights, including user management, bootstrapped via environment variables on first run |

## Project Structure

```
src/
├── modules/
│   ├── auth/         # Login, refresh, logout
│   ├── users/         # User management, password changes/resets
│   ├── vessel/         # Vessel CRUD, import, archiving trigger
│   ├── terminal/       # Terminal/berth reference data
│   └── archive/        # Archived vessel records
├── database/
│   ├── migrations/    # Knex migrations (SQLite + PostgreSQL compatible)
│   └── seeds/          # Seed data
├── jobs/               # Scheduled jobs (e.g. archive cleanup)
├── middleware/          # Auth, RBAC, validation, rate limiting
├── config/              # App/environment configuration
└── utils/                # Shared helpers

public/                # Vanilla JS frontend (api/auth/components/formatters/utils)
docs/                  # OpenAPI spec
tests/                 # Jest unit + integration tests
```

## Testing

```bash
npm test
npm run test:coverage
```

Tests cover both unit (service/repository logic) and integration (HTTP endpoints via Supertest) levels.

## Deployment

- **Application**: deployed on [Render](https://render.com) (see `render.yaml`), health-checked at `/api/health`
- **Database**: [Supabase](https://supabase.com) managed PostgreSQL in production (`DB_CLIENT=pg`)
- **CI/CD**: GitHub Actions — lint → `npm audit` → test → Docker build on every push
- **Containerization**: `Dockerfile` + `docker-compose.yml` provided for self-hosting behind a reverse proxy (e.g. Nginx with Let's Encrypt)

## License

Add your license here (e.g. MIT).
