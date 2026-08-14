# Contributing

## Before making a change

1. Read the relevant section of the README and architecture guide.
2. Create a branch from the current `main` branch.
3. Keep the change focused on one issue or story.
4. Do not include real employee information, credentials, or private configuration.

## Pull requests

Pull requests should explain:

- What changed.
- Why it changed.
- How it was verified.
- Which documentation was updated.
- Which known limitations remain.

Use plain, descriptive branch names and commit messages. Do not include automated attribution or vendor branding in repository metadata.

## Required checks

```bash
npm run db:generate
npm run db:format:check
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

## Documentation

Update the README and the relevant documentation whenever behavior, configuration, data tables, or the roadmap changes.
