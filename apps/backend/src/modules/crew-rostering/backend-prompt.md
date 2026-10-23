You are a Senior NestJS Backend Engineer working on **Feature 8: Crew Management & Rostering**.

Your task is to implement the backend codebase strictly inside the following directory path:
`/Users/xiangxiang/Desktop/Integrated-Project /Airline-Integrated-PJ/airline-management-system/apps/backend/src/modules/crew-rostering`

### Architecture & Folder Structure Rules
Inside `crew-rostering`, you must organize the backend code by separating them into 5 sub-folders corresponding to each page/workflow:
1. `build-pairing`
2. `assign-crew`
3. `fix-publish`
4. `setup-crew`
5. `setup-rule`

**Crucial File Structure Requirement:**
For **every single one** of the 5 sub-folders above, you must create exactly 3 files named after the folder (using kebab-case or exact folder name prefix):
- `<foldername>.controller.ts`
- `<foldername>.module.ts`
- `<foldername>.service.ts`

*(Note: Do NOT use DTO files. Handle request validation/typing directly or inline where appropriate without separate DTO classes).*

---

### Scope of Work & API Details (Crucial Emphasis)
- **Comprehensive API Scope:** You can fully review and determine all the required APIs that need to be created by inspecting the completed frontend pages of each respective folder that has already been organized. Ensure that every necessary endpoint required by the frontend UI is fully implemented in the corresponding module.
- **Scope per Folder:**
  - **`setup-crew`**: Handle crew listing, profile retrieval, crew creation, profile updates, base/fleet assignments, and crew certifications.
  - **`setup-rule`**: Handle legality rules fetching/updating, default rule parameters, and country-specific language/rule configurations.
  - **`build-pairing`**: Handle flight availability queries, automated pairing generation, pairing validation checks, CRUD/leg-editing on pairings, and committing valid pairings to roster.
  - **`assign-crew`**: Handle available valid pairings retrieval, automatic crew assignment execution, coverage stats, and rule break detection/listing.
  - **`fix-publish`**: Handle candidate evaluations for rule breaks, previewing swaps, applying/undoing swaps, company-rule overrides with audit logging, and final roster publishing validation.

---

### Database & Query Reference
- **DO NOT** create, modify, or add anything to the database schema. Do not run migrations or alter existing DB schemas.
- If you encounter any uncertainty regarding database table names or if a table name error occurs, ignore it or proceed based on standard naming conventions. **Do not create or modify schemas.**
- Refer to and query data based strictly on the schema and table definitions documented in:
  `/Users/xiangxiang/Desktop/Integrated-Project /Airline-Integrated-PJ/airline-management-system/apps/backend/src/db/db_docs/docs/f8-crew-management-and-rostering.md`

---

### Strict Guidelines & Constraints
1. **Separation of Concerns:** Implement everything completely separated into its respective page folder. 
2. **No Frontend Integration:** **Do NOT** integrate the backend with the frontend under any circumstances. Keep the backend completely standalone and modular.
3. **TypeScript & NestJS Standards:** Use explicit return types on all Controller and Service methods. Avoid `any` where possible. Use built-in NestJS HTTP exceptions.
4. **Clarification:** If you are unsure about any specific business logic or database field mapping from the documentation, **ask first** before generating the code.

Please implement the complete NestJS modules, controllers, and services for all 5 sections following these exact rules.