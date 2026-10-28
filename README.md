# opencode-file-browser

A file-browser plugin for **opencode v2**. It adds an arrow-key file dialog to
the terminal UI plus file tools for the agent.

- **TUI dialog** — `/files` (or Command Palette → **File browser**) opens a
  navigable dialog. Arrow keys move, type to search, Enter opens a folder or
  file, and **Set this folder as project root** changes the browser root.
- **Agent tools** — `file_tree`, `file_open`, and `file_search`.
- All paths are resolved inside the project root and cannot escape it.

## Install

### From a local folder (global)

Add the directory to your global `opencode.json(c)`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["D:\\Side Work\\opencode-file-browser"]
}
```

Install its dependencies once:

```sh
cd opencode-file-browser
npm install
```

Restart opencode (config is loaded at startup).

### From npm

```jsonc
{
  "plugins": ["opencode-file-browser"]
}
```

## Usage

- Type `/files` (alias `/browse`) in the TUI, or press `Ctrl+P` and choose
  **File browser**.
- In the dialog:
  - **↑ / ↓** move, type to search, **Enter** opens.
  - Folder entries open the next directory.
  - File entries show the file content.
  - **Set this folder as project root** stores the current folder as the
    browser root for later sessions.
- Ask the agent to "show the project tree", "open package.json", or "find
  files named config" to use the tools.

## Structure

```text
src/index.ts   server part: file_tree, file_open, file_search
src/tui.ts     TUI part: /files dialog with arrow-key navigation
```

## Disclaimer

This software is provided **"AS IS"**, free of charge, for professional and
personal use. It is released under the MIT license, which carries no warranty
of any kind. **The author and contributors accept no responsibility or
liability for any harm, loss, data corruption, or damage** arising from the
use of this software, to the fullest extent permitted by law. Use at your own
risk.

## License

[MIT](./LICENSE)
