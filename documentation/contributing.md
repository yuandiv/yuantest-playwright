# Contributing Guide

Thank you for your interest in YuanTest Playwright! We welcome code contributions, bug reports, and suggestions.

## Code of Conduct

This project adopts the Contributor Covenant as its code of conduct. By participating in this project, you agree to abide by its terms.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an [Issue](https://github.com/yuandiv/yuantest-playwright/issues), including:

1. Clear title and description
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Environment information (Node.js version, OS, etc.)

### Proposing New Features

If you have an idea for a new feature, please create an [Issue](https://github.com/yuandiv/yuantest-playwright/issues), including:

1. Feature description
2. Use cases
3. Possible implementation approach

### Submitting Code

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## Development Guide

### Environment Setup

```bash
# Clone the repository
git clone https://github.com/yuandiv/yuantest-playwright.git
cd yuantest-playwright

# Install dependencies
npm install

# Build
npm run build
```

### Development Commands

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run typecheck

# Generate documentation
npm run docs
```

### Code Style

- Use TypeScript
- Follow ESLint rules
- Use Prettier for code formatting
- Write meaningful commit messages

### Commit Message Convention

Use Conventional Commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation update
- `style:` Code formatting (does not affect functionality)
- `refactor:` Refactoring
- `test:` Test related
- `chore:` Build/tool related

Example:
```
feat: add AI-powered failure analysis
fix: resolve WebSocket connection issue
docs: update API reference
```

### Pull Request Guidelines

1. Ensure all tests pass
2. Update relevant documentation
3. Add necessary tests
4. Keep PR focused on a single feature
5. Write a clear PR description

## Project Structure

```
yuantest-playwright/
├── bin/              # CLI entry point
├── dashboard/        # Web Dashboard frontend
├── src/              # Source code
│   ├── orchestrator/ # Test orchestration
│   ├── executor/     # Test execution
│   ├── reporter/     # Report generation
│   ├── flaky/        # Flaky management
│   ├── realtime/     # Real-time reporting
│   └── ...
├── tests/            # Test files
├── documentation/    # Documentation source files
└── docs/             # API documentation output
```

## License

This project is licensed under the MIT License. By submitting code, you agree to license your code under the same license.
