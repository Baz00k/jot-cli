# jot-cli - Agent Guidelines

## Important Commands

- **Install dependencies**: `bun install`
- **Run**: `bun run src/index.ts`
- **Check (types, linting, formatting)**: `bun check`
- **Fix auto fixable errors**: `bun check:fix`
- **Run tests**: `AGENT=1 bun test`
- **Run single test**: `bun test <filename.test.ts>`
- **Compile**: `bun compile`

## Code Style Guidelines

The code uses Effect TS. When writing code, ensure it follows newest Effect TS conventions and best practices.
Use Effect for error safety.

### Runtime & Tools

- Use Bun instead of Node.js/npm/pnpm
- Use `bun test` for testing framework

### Import Style

- Use explicit type imports
- Import using relative paths for files in the same directory
- Import using path aliases everywhere else

### Naming Conventions

- Prefer single word variable names where possible
- Use camelCase for variables and functions
- Use PascalCase for classes/types/namespaces
- CLI commands should use descriptive, action-oriented names

### Testing

- When running tests, use `AGENT=1 bun test` for clearer test output
- Only write tests for critical functionality
- Use `bun test` with built-in test framework
- Test files should end with `.test.ts`
- Use `test()` and `expect()` from "bun:test"

### Documentation

- Use JSDoc comments for function parameters and return types
- Use Markdown for documentation formatting
- Do not create or update README.md or similar files unless specifically requested

### Workflow

Before completing every task, run `bun check:fix` to check for type errors and linting issues
and `bun test` to ensure all tests pass.
NEVER commit any changes without explicit user request.
