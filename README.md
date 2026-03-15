# Share Proxy

Create public links for media hosted across different platforms (S3, Google Drive, Jellyfin, YouTube)

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE). 

You are free to self-host and modify this software for personal or internal business purposes. However, if you provide access to a modified version of this software over a network (e.g., as a managed SaaS), you must make the complete source code of your modifications publicly available under the same AGPL-3.0 license.

## Development

### Prerequisites
- [Node.js 24+](https://nodejs.org/) (use `nvm use` based on `.nvmrc`)
- [pnpm](https://pnpm.io/)
- PostgreSQL 18+ reachable through `DATABASE_URL`, or [Docker](https://www.docker.com/) for the bundled local PostgreSQL container

### First-Time Setup
1. **Install Dependencies**
   ```bash
   pnpm install
   ```
2. **Setup Environment Variables**
   ```bash
   cp .env.example .env
   ```
   *The project uses PostgreSQL only. If `DATABASE_URL` already points to a reachable PostgreSQL instance, local commands reuse it directly. Otherwise `pnpm dev` and `pnpm test` automatically start the bundled local postgres container. `POSTGRES_DATA_DIR` points directly at the postgres data directory. If an old incompatible local cluster is found, it is moved into a sibling `*-backups` directory and a fresh cluster is initialized.*

3. **Database Migrations**
   ```bash
   pnpm --filter @share-proxy/db db:push
   ```

### Running Locally
To start the entire monorepo in development mode (Admin Web, Admin API, and Proxy):
```bash
pnpm dev
```
- **Admin Web** will be available at: http://localhost:5173
- **Admin API** will be available at: http://localhost:3000
- **Proxy Server** will be available at: http://localhost:3001
- **Viewer Links** are built from `PROXY_ORIGIN` (defaults to `http://localhost:3001`)
- `pnpm dev` first tries to use the PostgreSQL instance from `DATABASE_URL`; if it is not reachable, it falls back to `docker compose up -d --wait postgres`.

### CI Checks
GitHub Actions runs the same checks below on pushes and pull requests:
```bash
pnpm lint
pnpm test:ci
```
`test:ci` runs workspace package tests and does not include Playwright E2E.

### Docker Compose
Alternatively, if you want to test the full production-like build or use a real PostgreSQL database, you can use docker-compose:
```bash
docker-compose up --build
```
*Use the same `DATABASE_URL` / `POSTGRES_DATA_DIR` values as in your `.env`.*
