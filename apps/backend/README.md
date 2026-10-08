# Airline Management System — Backend

NestJS backend workspace for the Airline Management System (CSC290 Integrated Project I).

## Current Tech Stack

- **Framework:** NestJS 11 + TypeScript
- **ORM:** Prisma 7
- **Database:** PostgreSQL 16
- **Authentication:** Clerk + project-issued JWT access tokens + rotating refresh-token cookies
- **Object storage:** SeaweedFS (S3-compatible, replaces MinIO) is provisioned in Docker Compose but is not yet integrated into backend code

## API

The application uses the global prefix:

```text
/api
```

Current authentication endpoints:

```text
POST /api/auth/session
POST /api/auth/refresh
POST /api/auth/logout
```

The current repository does not yet include `@nestjs/swagger`; OpenAPI/Swagger remains a project-standard integration to be added by the Dev Leads if/when it is introduced.

## Local Development

From the repository root:

```bash
npm install
npm run db:up
npm run start:dev -w apps/backend
```

See [`../../docs/infra-guide.md`](../../docs/infra-guide.md) for environment and authentication setup.
