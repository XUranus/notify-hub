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
3. **Set up the development environment** (see [Development](./development.md)):
   ```bash
   cd rust-server
   cargo build
   cd ../web && pnpm install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feat/my-feature
   ```

## Reporting Issues

Before opening a new issue, search the [existing issues](https://github.com/notifyhub/notifyhub/issues) to check if someone has already reported it.

### Bug reports

When filing a bug report, include:

- **NotifyHub version** -- Run `git rev-parse HEAD` or check the server startup logs.
- **Rust version** -- Run `rustc --version`.
- **Operating system** and architecture.
- **Steps to reproduce** -- A minimal set of steps that trigger the bug.
- **Expected behavior** -- What you expected to happen.
- **Actual behavior** -- What actually happened, including any error messages or stack traces.
- **Relevant logs** -- Server logs (`RUST_LOG=debug`), browser console output, or network requests.

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
   cd rust-server
   cargo check
   cargo test
   cd ../web && pnpm tsc --noEmit
   ```

2. **Run the linter**:
   ```bash
   cd rust-server
   cargo clippy -- -D warnings
   ```

3. **Write or update tests** for your changes. Every new feature and bug fix should have test coverage.

4. **Update documentation** if your change affects the public API, configuration, or user-facing behavior. Documentation lives in the `docs/` directory.

5. **Write a clear commit message** (see [Commit Conventions](#commit-conventions) below).

6. **Push your branch** and open a pull request against `master`.

7. **Fill in the PR description** with:
   - What the PR does and why.
   - Related issue numbers (e.g., `Closes #42`).
   - Testing steps.
   - Screenshots for UI changes.

### PR review checklist

Reviewers will check:

- [ ] Code compiles without errors or warnings.
- [ ] Rust code passes `cargo clippy` with no warnings.
- [ ] TypeScript code passes type checking.
- [ ] Input is validated (serde for Rust, Zod for TypeScript).
- [ ] Database operations use sqlx with parameterized queries.
- [ ] Sensitive data (passwords, tokens, keys) is never logged or returned in responses.
- [ ] New API endpoints have appropriate auth middleware.
- [ ] Documentation is updated.
- [ ] Commit messages follow the conventions below.

## Code Standards

### Rust (server, CLI, desktop backend)

- Use `rustfmt` for formatting (`cargo fmt`).
- Use `clippy` for linting (`cargo clippy`).
- Prefer `impl Trait` over boxed trait objects for return types.
- Use `thiserror` for error types in the server, `anyhow` in the CLI.
- Use `serde` with `#[serde(rename_all = "camelCase")]` for JSON serialization.
- Use `sqlx` compile-time checked queries where possible.
- Use `tracing` for structured logging (not `println!`).
- Keep functions focused. If a function does too many things, split it.

### TypeScript (web frontend, docs)

- Use `type` for object shapes and `interface` for contracts that may be extended.
- Prefer `const` assertions and literal types over enums.
- Use ESM (`import`/`export`) throughout.

### Error handling

- Use `AppError` enum for API errors in the server. It implements `IntoResponse` and returns structured JSON.
- API routes must return structured responses: `{ success: boolean, data?: T, error?: string }`.
- Never expose internal details (stack traces, database errors) in API responses in production.
- Log errors with `tracing::error!()` with context.

### Security

- Never store secrets in plaintext. Channel credentials must be encrypted with AES-256-GCM before writing to the database.
- Never log tokens, passwords, or encryption keys.
- Validate and sanitize all user input.
- Use `argon2` or `bcrypt` for password hashing.
- Use `jsonwebtoken` with a configured secret (not a hardcoded value).

### Database

- All schema changes go through sqlx migrations.
- Use `snake_case` for SQL column names.
- Add indexes for columns used in `WHERE` clauses (especially in the messages table).
- Always use parameterized queries. Never interpolate user input into SQL strings.

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

Use the component or area affected:

- `server` -- Rust API server changes
- `cli` -- Rust CLI changes
- `common` -- Shared Rust types/constants
- `web` -- Frontend dashboard changes
- `desktop` -- Tauri desktop client changes
- `android` -- Android client changes
- `channel` -- Channel adapter changes
- `queue` -- Message queue/worker changes
- `auth` -- Authentication and authorization
- `db` -- Database schema and migrations
- `docs` -- Documentation
- `push` -- Push delivery (SSE/WS/poll)

### Examples

```
feat(channel): add SendGrid email adapter
fix(push): prevent duplicate delivery with concurrent workers
docs(api): update send endpoint documentation
refactor(auth): extract rate limiter into separate module
test(template): add edge case tests for default values
chore(deps): update axum to 0.8
```

## Release Process

Releases are managed by the maintainers. The typical flow:

1. Features and fixes are merged into `master`.
2. The version in `Cargo.toml` is bumped following [Semantic Versioning](https://semver.org/).
3. A git tag is created (e.g., `v0.2.0`).
4. The Docker image is built and published.
5. Desktop and Android builds are created for the release.

## Getting Help

If you need help with contributing:

- Open a [discussion](https://github.com/notifyhub/notifyhub/discussions) on GitHub.
- Comment on the relevant issue or PR.
- Check the [Development](./development.md) guide for technical details.

## License

By contributing to NotifyHub, you agree that your contributions will be licensed under the same license as the project.
