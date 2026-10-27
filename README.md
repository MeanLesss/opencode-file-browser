# opencode-file-browser

A tiny opencode plugin that adds a **file browser** to the opencode CLI: browse
the project tree, open files, and search files by name — all from the chat/TUI.

## Tools

| Tool           | What it does                                                            |
| -------------- | ----------------------------------------------------------------------- |
| `file_tree`    | List the project (or a subfolder) as a tree, with depth + dotfile options |
| `file_open`    | Read and return the text content of a file inside the project            |
| `file_search`  | Find files by name (case-insensitive substring), scoped to a folder      |

All paths are resolved relative to the project root and are validated so the
tools cannot escape the project directory.

## Install

### Global (all projects)

Copy the plugin into opencode's global plugin directory:

- Linux/macOS: `~/.config/opencode/plugins/`
- Windows: `%USERPROFILE%\.config\opencode\plugins\` (or `$XDG_CONFIG_HOME/opencode/plugins/`)

```sh
mkdir -p ~/.config/opencode/plugins
cp index.ts ~/.config/opencode/plugins/opencode-file-browser.ts
```

The plugin imports `@opencode-ai/plugin`; make sure your config directory has a
`package.json` with that dependency (opencode runs `bun install` at startup):

```json
{ "dependencies": { "@opencode-ai/plugin": "1.1.34" } }
```

Restart opencode to load it.

### Per project

Drop the same file into `.opencode/plugins/` of the project instead.

### From npm

```json
{ "plugin": ["opencode-file-browser"] }
```

## Usage

In the opencode TUI, ask naturally — the agent will call the tools:

- "show me the project tree"
- "browse the src folder"
- "open package.json"
- "find files named *config*"

## Disclaimer

This software is provided **"AS IS"**, free of charge, for professional and
personal use. It is released under the MIT license, which carries no warranty
of any kind. **The author and contributors accept no responsibility or
liability for any harm, loss, data corruption, or damage** arising from the
use of this software, to the fullest extent permitted by law. Use at your own
risk.

## License

[MIT](./LICENSE)
