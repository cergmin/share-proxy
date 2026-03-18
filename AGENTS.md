# AI Agent Instructions

1. **Memory Bank Maintenance:** 
   Our architectural decisions, system design, and roadmap are kept inside the `memory-bank` directory. 
   Whenever we make a structural change, add a new table, choose a new technology, or alter the roadmap, you MUST update the markdown files in `memory-bank` (e.g., `memory-bank/architecture/system-design.md`, `memory-bank/roadmap.md`). 
   This ensures the documentation acts as the source of truth for all future contexts.

2. **Tech Stack Constraints:**
   Always review `memory-bank/architecture/system-design.md` for current tech stack limits. As of now:
   - Node 24 (`.nvmrc`).
   - PNPM Workspaces.
   - Fastify (for Admin API and Proxy).
    - Vite 8 + React 19 + CSS Modules (Admin Web).
   - Drizzle ORM + PostgreSQL 18.
   - BetterAuth for Auth logic.
   - Unified Env setup (`SECRET`, `ADMIN_API_ORIGIN`, `ADMIN_FRONTEND_ORIGIN`, `DATABASE_URL`, `POSTGRES_DATA_DIR`, `PROXY_ORIGIN`).

3. **Check before you build:**
   If asked to implement a feature, always review `memory-bank/architecture/system-design.md` first to understand existing entity structures (like `access_rules` and `aliases` for Links) to avoid duplicating logic.

4. **UI Regression Workflow:**
   After any UI-affecting change (especially in `packages/video-player`, `packages/components`, or `apps/admin-web`), you MUST run the relevant screenshot / Storybook visual tests before finishing the task.
   You MUST then manually review the resulting screenshots or diffs.
   - If the new visuals are correct, update the screenshot baselines.
   - If the new visuals are not correct, fix the UI and rerun the tests.
   Never finish a UI task without both running and visually checking the screenshot tests.
