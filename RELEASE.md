# Release Guide

## Before Releasing

1. **Add a changeset** (on feature branch or before merge):

   ```bash
   pnpm release:changeset
   ```

   - Select version bump type (major/minor/patch)
   - Write a user-facing summary
   - Commit the generated `.changeset/*.md` file

2. **Skip changeset** for non-user-facing changes:
   - Docs, tests, refactors, CI changes

## Publishing a Release

1. **Bump version & generate CHANGELOG**:

   ```bash
   pnpm release:version
   ```

   - Consumes all changesets
   - Updates `package.json` version
   - Updates `CHANGELOG.md`

2. **Build & publish to npm**:

   ```bash
   pnpm release:publish
   ```

   - Builds the package
   - Publishes to npm
   - Creates git tags

3. **Commit & push**:
   ```bash
   git add .
   git commit -m "chore: release vX.X.X"
   git push --follow-tags
   ```

## Quick Reference

| Command                  | Description                      |
| ------------------------ | -------------------------------- |
| `pnpm release:changeset` | Add a changeset for your changes |
| `pnpm release:version`   | Bump version & update CHANGELOG  |
| `pnpm release:publish`   | Build & publish to npm           |
