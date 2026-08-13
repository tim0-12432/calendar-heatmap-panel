# Contributing to Calendar Heatmap Panel

Thank you for your interest in contributing to the Calendar Heatmap Panel! We welcome contributions from everyone and are excited to work together to make this plugin even better.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Plugin Development Best Practices](#plugin-development-best-practices)
- [Commit Message Conventions](#commit-message-conventions)
- [Getting Help](#getting-help)

## 📜 Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold these standards. Please report unacceptable behavior to the maintainers.

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 22 (LTS recommended)
- pnpm 11.21.0
- Docker (for running a local Grafana instance)
- Git

### Quick Setup

```bash
# 1) Fork and clone your fork
https clone https://github.com/YOUR_USERNAME/calendar-heatmap-panel.git
cd calendar-heatmap-panel

# 2) Install dependencies
pnpm ci

# 3) Start plugin dev server
pnpm dev

# 4) Start Grafana in Docker (separate terminal)
pnpm server
```

Access Grafana at http://localhost:3000 (admin/admin).

## 🛠️ How to Contribute

### Reporting Bugs

1. Search existing issues first.
2. Reproduce with the latest main branch.
3. Provide details: Grafana version, plugin version, browser/OS, steps to reproduce, expected vs. actual behavior, and console/network errors.

### Requesting Features

1. Check for existing requests.
2. Describe the use case and value.
3. Propose an approach if possible; be open to alternatives.

### Submitting Enhancements

- Keep changes focused and minimal.
- Update or add tests for new logic.
- Update documentation when behavior changes.
- Ensure necessary translations are in place.

## 💻 Development Environment

### Commands

```bash
pnpm dev        # Hot reload development
pnpm build      # Production build
pnpm server     # Grafana + plugin in Docker
pnpm lint       # ESLint
pnpm lint:fix   # Autofix lint issues
pnpm typecheck  # TypeScript type checks
pnpm test       # Unit tests (watch)
pnpm test:ci    # Unit tests (CI)
pnpm e2e        # Playwright end-to-end
pnpm sign       # Sign plugin for distribution
```

### Environment Variables

```bash
GRAFANA_VERSION=11.6.0 pnpm server  # Pin Grafana version
GRAFANA_PORT=3001 pnpm server       # Custom port
```

## 🏗️ Project Structure

```
src/
├── components/           # React components
│   └── CalendarHeatmapPanel.tsx
├── utils/                # Pure utilities (data aggregation, palettes)
│   └── dataProcessor.ts
├── types.ts              # Shared types
├── module.ts             # Plugin registration & options
└── plugin.json           # Plugin metadata

.config/                  # Tooling (webpack, jest, tsconfig fragments)
tests/                    # E2E tests (Playwright)
provisioning/             # Grafana provisioning for dev
```

## 📝 Code Style Guidelines

### TypeScript & React

- Strict TypeScript; no implicit `any`.
- Named exports; avoid default exports unless a file has a single clear export.
- Explicit prop typing; avoid `React.FC` unless children typing is needed.
- Keep components small and focused.
- Use `useMemo`/`useCallback` for expensive work or stable references passed to memoized children.
- Prefer pure functions in `utils/` for data processing.
- Handle empty/invalid data gracefully; never throw uncaught errors from render paths.

### Styling

- Uses Emotion CSS with Grafana theme tokens (`useTheme2`).
- Keep styles co-located with components and memoize theme-dependent style objects when non-trivial.

### Accessibility

- Use semantic elements; every interactive element must be keyboard accessible.
- Provide labels for inputs/switches; tooltips should not be the sole means of conveying information.

## 🧪 Testing Requirements

- Unit tests (Jest) for utilities and logic (aggregation, palettes, sizing).
- Component tests (React Testing Library) for rendering and interactions where feasible.
- E2E tests (Playwright) for critical flows: rendering the panel, tooltips, option changes.
- Run `npm run lint`, `npm run typecheck`, `npm run test:ci`, and `npm run e2e` before submitting PRs.

### Example Unit Test (aggregation)

```typescript
describe('aggregate', () => {
  it('sums values', () => {
    expect(aggregate([1, 2, 3], 'sum')).toBe(6);
  });
});
```

## 🔄 Pull Request Process

1. Branch from `main`.
2. Keep PRs small and scoped; include rationale in the description.
3. Ensure all checks pass: lint, typecheck, tests, e2e (when applicable).
4. Update docs and changelog entries when user-facing behavior changes.
5. Request review from a maintainer; address feedback promptly.

### PR Template

```
## Summary
- What changed and why

## Testing
- [ ] lint
- [ ] typecheck
- [ ] test:ci
- [ ] e2e (if applicable)
- Manual verification steps

## Screenshots/Notes
- Optional
```

## 🎯 Plugin Development Best Practices

- Validate DataFrames: require one time field and one numeric field; surface clear errors to users.
- Keep data processing pure; no side effects in aggregation helpers.
- Memoize derived data and styles to minimize re-renders.
- Respect Grafana theme and accessibility defaults (contrast, focus states).
- Avoid expensive synchronous work in render; precompute in hooks.

## 📝 Commit Message Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation only
- `refactor`: code change without behavior change
- `test`: add or update tests
- `chore`: tooling, build, or dependency updates
- `perf`: performance improvements

Examples:

```
feat(heatmap): add teal color scheme
fix(data): guard against null numeric fields
```

## 🆘 Getting Help

- GitHub Issues: bug reports and feature requests
- GitHub Discussions: questions and design ideas
- Grafana Community Forums: general Grafana usage

Thank you for contributing to the Calendar Heatmap Panel! Your improvements help everyone. 🚀
