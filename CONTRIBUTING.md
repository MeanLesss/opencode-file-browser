# Contributing

Thanks for helping improve `opencode-file-browser`.

## Setup

```sh
git clone https://github.com/MeanLesss/opencode-file-browser.git
cd opencode-file-browser
npm install
npm run typecheck
```

## Test in a real opencode instance

1. Add this folder to both `opencode.jsonc` and `tui.json` as described in the
   README.
2. Restart opencode.
3. Verify at least one affected path:
   - `/files` opens and navigates.
   - Switch project, copy path, and new terminal behave as expected.
   - `file_tree`, `file_open`, or `file_search` work from the agent.

TUI and server configs are separate; the dialog comes from `tui.json` and the
agent tools come from `opencode.json(c)`.

## Guidelines

- Keep pull requests focused on one problem.
- Match the existing style: TypeScript, no build step, no new runtime
  dependencies unless clearly justified.
- Update the README when behavior, configuration, or requirements change.
- Do not commit secrets, tokens, or personal absolute paths.
- Prefer small, readable functions over clever abstractions.

## Commit messages

Use an imperative subject line and a short body when useful:

```text
Add syntax highlighting to file previews

- Color fenced code blocks in the preview dialog
- Fall back to plain text for unknown languages
```

## Pull requests

Include:

- The problem being solved.
- What you changed.
- How you tested it.
- Screenshots or short recordings for UI changes when possible.

CI runs `npm run typecheck` on Node 22 and 24. Please make sure it passes before
requesting review.

## Reporting bugs

Open an issue with the bug template. Include your opencode version, operating
system, steps to reproduce, and any `[tui.plugin]` lines from
`~/.local/share/opencode/log/opencode.log`.
