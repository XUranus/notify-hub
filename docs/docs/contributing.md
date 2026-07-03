---
sidebar_position: 5
sidebar_label: 'Contributing'
---

# Contributing

Thank you for your interest in contributing to NotifyHub. This document explains how to report issues, submit changes, and follow the project's conventions.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/notifyhub.git
   cd notifyhub
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feat/my-feature
   ```

## Reporting Issues

Before opening a new issue, search the [existing issues](https://github.com/notifyhub/notifyhub/issues) to check if someone has already reported it.

### Bug reports

When filing a bug report, include:

- **NotifyHub version** -- Run `git rev-parse HEAD` or check the version in the server startup banner.
- **Node.js version** -- Run `node --version`.
- **Operating system** and architecture.
- **Steps to reproduce** -- A minimal set of steps that trigger the bug.
- **Expected behavior** -- What you expected to happen.
- **Actual behavior** -- What actually happened, including any error messages or stack traces.
- **Relevant logs** -- Server logs, browser console output, or network requests.

### Feature requests

When requesting a feature, describe:

- **The problem** you are trying to solve.
- **Your proposed solution** (if you have one).
- **Alternatives** you have considered.
- **Use cases** -- Who benefits from this and how?

## Pull Request Process

### Before you start

- For large changes, open an issue first to discuss the approach. This avoids spending time on a PR that may not align with the project's direction.
- Check the [Development](./development.md) guide for setup instructions and project conventions.

### Submitting a PR

1. **Make sure your code compiles**:
   ```bash
   pnpm typecheck
   pnpm build
   ```

2. **Run the linter**:
   ```bash
   pnpm lint
   ```

3. **Write or update tests** for your changes. Every new feature and bug fix should have test coverage.

4. **Update documentation** if your change affects the public API, configuration, or user-facing behavior. Documentation lives in the `docs/` directory.

5. **Write a clear commit message**:
   ```
   feat(channel): add Slack webhook adapter

   - Implement ChannelAdapter for Slack incoming webhooks
   - Add 'slack' to SMS_PROVIDERS constant
   - Include config validation for webhook URL
   ```

6. **Push your branch** and open a pull request against `main`.

7. **Fill in the PR description** with:
   - What the PR does and why.
   - Related issue numbers (e.g., `Closes #42`).
   - Testing steps.
   - Screenshots for UI changes.

### PR review checklist

Reviewers will check:

- [ ] Code compiles without errors or warnings.
- [ ] TypeScript types are correct and explicit where needed.
- [ ] Input is validated with Zod schemas.
- [ ] Database operations use Drizzle ORM (no raw SQL unless necessary).
- [ ] Sensitive data (passwords, tokens, keys) is never logged or returned in responses.
- [ ] New API endpoints have appropriate auth middleware.
- [ ] Documentation is updated.
- [ ] Commit messages follow the conventions below.

## Code Standards

### General

- Write TypeScript. No JavaScript files.
- Use ESM (`import`/`export`). No `require()`.
- Keep functions small and focused. If a function does too many things, split it.
- Prefer composition over inheritance.

### Formatting and linting

The project uses ESLint for linting. Run `pnpm lint` to check your code. Most formatting issues are caught by the linter; there is no separate Prettier step.

### Error handling

- Always handle errors in async functions. Use `try/catch` and return meaningful error messages.
- API routes must return structured responses: `{ success: boolean, data?: T, error?: string }`.
- Never expose internal details (stack traces, database errors) in API responses in production.

### Security

- Never store secrets in plaintext. Channel credentials must be encrypted with `encrypt()` before writing to the database.
- Never log tokens, passwords, or encryption keys.
- Validate and sanitize all user input.
- Use `bcrypt` for password hashing (cost factor 10).
- Use `jsonwebtoken` with a configured secret (not a hardcoded value).

### Database

- Define all schema changes in `packages/server/src/db/schema.ts`.
- Generate migrations with `pnpm db:generate` and commit the generated files.
- Use `snake_case` for SQL column names and `camelCase` in Drizzle/TypeScript (Drizzle handles the mapping).
- Add indexes for columns used in `WHERE` clauses (especially in the messages table).

## Commit Conventions

NotifyHub follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Code style changes (formatting, no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Build process, CI, dependencies, tooling |

### Scopes

Use the package or area affected:

- `server` -- API server changes
- `web` -- Frontend dashboard changes
- `cli` -- CLI tool changes
- `shared` -- Shared types/schemas/constants
- `channel` -- Channel adapter changes
- `queue` -- Message queue changes
- `auth` -- Authentication and authorization
- `db` -- Database schema and migrations
- `docs` -- Documentation

### Examples

```
feat(channel): add SendGrid email adapter
fix(queue): prevent duplicate claims with concurrent workers
docs(api): update send endpoint documentation
refactor(auth): extract rate limiter into separate module
test(template): add edge case tests for default values
chore(deps): update hono to v4.6.0
```

## Release Process

Releases are managed by the maintainers. The typical flow:

1. Features and fixes are merged into `main`.
2. The version in `package.json` is bumped following [Semantic Versioning](https://semver.org/).
3. A git tag is created (e.g., `v0.2.0`).
4. The Docker image is built and published.

## Getting Help

If you need help with contributing:

- Open a [discussion](https://github.com/notifyhub/notifyhub/discussions) on GitHub.
- Comment on the relevant issue or PR.
- Check the [Development](./development.md) guide for technical details.

## License

By contributing to NotifyHub, you agree that your contributions will be licensed under the same license as the project.
