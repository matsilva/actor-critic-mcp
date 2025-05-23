# Repository Guidelines

This file provides orientation for coding agents working in this repository.

## Navigating the Project

- **`src/`** – Core TypeScript source files. Start with `src/index.ts` for the main entry point.
- **`agents/`** – Python-based agents that complement the Node application.
- **`docs/`** – Additional documentation. See `docs/INSTALL_GUIDE.md` and `docs/OVERVIEW.md` for setup and background information.
- **`genai-node-reference.md`** – Reference for the Google Generative AI Node.js SDK. Use this when integrating or updating the `@google/genai` library.
- **`scripts/`** – Shell scripts for setup and testing.
- **`logs/`** – Runtime logs for debugging.

## Common Tasks

- Install dependencies with `npm install` and follow `scripts/setup.sh` if you need a full environment with Python agents.
- Run tests with `npm test`.
- Format code using `npm run format` and lint with `npm run lint`.

When implementing features that rely on the Google Generative AI Node.js library, **consult `genai-node-reference.md`** for usage patterns and best practices.
