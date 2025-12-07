# jot-cli - Agent Guidelines

## Build Commands

- **Install dependencies**: `bun install`
- **Run main**: `bun run src/index.ts`
- **Run tests**: `bun test`
- **Run single test**: `bun test <filename.test.ts>`
- **Build**: `bun build <entry-file>`
- **Compile**: `bun compile`

## Code Style Guidelines

### Runtime & Tools

- Use Bun instead of Node.js/npm/pnpm (per .cursor/rules/)
- Use `bun test` for testing framework
- Bun automatically loads .env files

### TypeScript Configuration

- Strict TypeScript enabled with @total-typescript/tsconfig
- ESNext target with bundler module resolution
- verbatimModuleSyntax: true (use explicit file extensions in imports)
- noUncheckedIndexedAccess: true

### Import Style

- Use explicit file extensions in imports (due to verbatimModuleSyntax)
- Import external dependencies first, then local modules
- Use absolute imports where possible

### Error Handling

- Use Zod for runtime validation and schema definitions
- Implement proper error boundaries in CLI operations
- Use @clack/prompts for consistent CLI user experience

### Naming Conventions

- Use camelCase for variables and functions
- Use PascalCase for classes/types
- Use kebab-case for file names when appropriate
- CLI commands should use descriptive, action-oriented names

### Testing

- When running tests, use `AGENT=1 bun test` for clearer test output
- Use `bun test` with built-in test framework
- Test files should end with `.test.ts`
- Use `test()` and `expect()` from "bun:test"

### Documentation

- Use JSDoc comments for function parameters and return types
- Use Markdown for documentation formatting
- Do not update README.md or similar files unless specifically requested
