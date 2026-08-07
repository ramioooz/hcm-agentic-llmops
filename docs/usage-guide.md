# Local usage guide

## Start infrastructure

```bash
npm install
cp .env.example .env
docker compose up -d postgres rabbitmq
```

## Prepare the database

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The migration command is safe to repeat. Prisma records applied migrations in `_prisma_migrations` and skips migrations that are already complete. The seed command is also repeatable for local development, but it first clears the current Sprint 1 sample/runtime records and recreates the fictional dataset. Do not use the seed command against data that must be preserved.

## Run the API

```bash
npm run dev
```

## Verify the service

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

When the API runs inside Docker Compose, use port `3300` instead of `3000`.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The current tests are focused unit tests. They do not require Docker or a live database. Infrastructure is verified manually during local setup until integration tests are added in a later release.
