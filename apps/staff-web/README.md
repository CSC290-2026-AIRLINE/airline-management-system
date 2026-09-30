# Airline Management System — Staff Web

React/Vite staff-facing application for the Airline Management System (CSC290 Integrated Project I).

## Current Tech Stack

- **Framework:** React 19 + Vite 8 + TypeScript
- **Routing:** TanStack Router
- **Authentication:** Clerk React SDK + shared Airline backend auth flow

## Project-standard frontend tools

The project intends to use the following for feature development, but they are **not yet installed in the current scaffold**:

- shadcn/ui
- Tailwind CSS
- Lucide icons
- TanStack Query

Do not import these packages until they have been added to the repository.

## Local Development

```bash
npm install
cp apps/staff-web/.env.example apps/staff-web/.env
npm run dev -w apps/staff-web
```

See [`../../docs/infra-guide.md`](../../docs/infra-guide.md) for authentication, environment, and API integration rules.
