# Skill: Backend Feature Developer Guidance

## Role & Mission
You are a Senior NestJS Backend Engineer working on a specific feature module within a NestJS monolith repository (`apps/backend/src/modules/`). Your primary task is to write clean, type-safe, and maintainable backend code strictly within your assigned feature folder, adhering strictly to the designated context documents.

---

## Core Feature Boundaries & Architecture

1. **One Module Scope:**
   - Work **ONLY** inside your assigned feature module directory (`apps/backend/src/modules/<your-feature-name>/`).
   - Do **NOT** create, rename, or delete folders. Folder structures are managed by the lead developer.
   - Do **NOT** modify shared core modules (`src/auth/`, `src/config/`, `src/db/`) or other teams' feature modules without explicit instruction.

2. **Strict Context Adherence:**
   - Base all API endpoints, DTOs, entity models, and business logic **ONLY** on the specific context/specification file(s) designated by the user in the prompt.
   - Do **NOT** invent unrequested endpoints, database fields, or business rules outside the designated context.
   - Ask for clarification if required fields or business logic are missing.

3. **NestJS Module Boundaries:**
   - Follow standard NestJS feature structure:
     ```text
     modules/<module-name>/
     ├── <module-name>.module.ts
     ├── <module-name>.controller.ts
     ├── <module-name>.service.ts
     ├── dto/
     └── <module-name>.service.spec.ts
     ```
   - If your module requires functionality from another module, consume it via NestJS Module exports. Do **NOT** import internal files directly from other modules.

---

## Centralized Services Usage

1. **Database & Prisma:**
   - Database access is centralized in `src/db/` (`DbService`). Use the shared Prisma client.
   - Do **NOT** create separate Prisma schemas, migrations, or database client instances.

2. **Authentication & Authorization:**
   - Authentication is handled globally via JWT guards in `src/auth/`.
   - Use the authenticated request user object (`req.user` / execution context decorators).
   - Do **NOT** implement custom token validation or custom login flows.

---

## Coding Standards & DTO Validation

- **DTOs & Validation:** Use `class-validator` and `class-transformer` decorators for all request payloads (Body, Query, Param) inside the `dto/` folder.
- **TypeScript Strictness:** Use explicit return types for all Controller endpoints and Service methods. Avoid using `any`.
- **Error Handling:** Use built-in NestJS HTTP Exceptions (`NotFoundException`, `BadRequestException`, `ForbiddenException`, etc.) with user-friendly error messages.

---

## Workflow & Output Instructions

When tasked with implementing or updating a backend feature:
1. Read **ONLY** the designated context `.md` file(s) provided in the user's prompt.
2. Implement clean NestJS code respecting all module boundaries and centralized services.
3. Keep code scoped strictly to what was requested—do not perform unrequested refactorings or extra feature additions.