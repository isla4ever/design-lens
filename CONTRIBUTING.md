# Contributing

Design Lens accepts focused fixes and features that preserve its local-first,
evidence-based capture model. Open an issue before large architecture or product
changes so the scope and privacy boundary can be agreed first.

## Development

Requirements:

- Node.js 22.13.0 or newer
- npm 10 or newer
- Chrome or another Chromium browser

```bash
npm ci
npm run dev
```

Use `npm run dev:collector` only when testing an authorized feature that needs
Chrome DevTools Protocol access. The standard build must never request the
`debugger` permission.

## Required Checks

```bash
npm run audit:dependencies
npm run check:all
npx playwright install chromium
npm run check:browser
npm run package:release
```

`check:browser` exercises ordinary and 100,000-node pages. A capture change is
not ready if it loses heartbeat interactions, exceeds the task budget, keeps
sampling after stop, fails to restore page state, or emits browser errors.

## Pull Requests

- Keep each pull request to one reviewable product or engineering outcome.
- Add behavior-focused tests for fixes and protocol changes.
- Include narrow and wide screenshots for visible UI changes.
- Update `CHANGELOG.md` for user-visible behavior.
- Do not commit captured website data, credentials, generated `.output/`,
  `dist/`, or `output/` artifacts.
- Do not add automatic click, input, submission, or unknown navigation behavior
  without an explicit product and privacy review.

By contributing, you agree that your contribution is licensed under the MIT
license in this repository.
