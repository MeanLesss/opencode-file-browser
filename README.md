# opencode-file-browser

A file-browser plugin for **opencode 1.x** that adds an arrow-key file dialog to
the terminal UI and gives the agent three safe, project-scoped file tools.

- **`/files` dialog** — navigate folders, fuzzy-search entries, preview files,
  switch the project directory, copy the current path, or open a new terminal
  there.
- **Agent tools** — `file_tree`, `file_open`, and `file_search`, all confined to
  the project root.
- **No configuration beyond the plugin path** — the browser remembers the last
  folder you used per project.

Tested with opencode **1.19.5** on Windows. It also works on macOS and Linux.

---

## Requirements

| Requirement | Notes |
| --- | --- |
| opencode **1.x** | Uses the `@opencode-ai/plugin` v1 API. opencode 2.x is not supported. |
| Node.js + npm | Only needed once, to install the plugin's dependencies. opencode itself runs on Bun. |
| A terminal with OSC52 or a native clipboard | Copy-path falls back to PowerShell/`clip.exe`, `pbcopy`, `wl-copy`, `xclip`, or `xsel`. |
| `opencode` on `PATH` | Only needed for **Open in a new terminal**. Set `OPENCODE_BIN` to override. |

---

## Install

There are two pieces, and each reads a different config file:

| Piece | What it adds | Config file |
| --- | --- | --- |
| Server plugin | `file_tree`, `file_open`, `file_search` | `opencode.json` / `opencode.jsonc` |
| TUI plugin | `/files` dialog and its actions | `tui.json` / `tui.jsonc` |

Both point at the same plugin directory. Add the plugin to **both** files if you
want the dialog and the agent tools.

Config locations:

- **Global** (all projects): `~/.config/opencode/` — on Windows this is
  `C:\Users\<you>\.config\opencode\`.
- **Project** (one project): `opencode.json(c)` and `tui.json(c)` in the project
  root, or inside a `.opencode/` folder.

> Paths must be **absolute** (`D:/tools/opencode-file-browser`,
> `/home/me/opencode-file-browser`) or start with `.` (relative to the config
> file). `~/...` is treated as an npm package name, so expand it yourself.

### 1. Get the plugin

**Windows (PowerShell):**

```powershell
git clone https://github.com/MeanLesss/opencode-file-browser.git "$HOME\opencode-file-browser"
Set-Location "$HOME\opencode-file-browser"
npm install
```

**macOS / Linux:**

```sh
git clone https://github.com/MeanLesss/opencode-file-browser.git ~/opencode-file-browser
cd ~/opencode-file-browser
npm install
```

Already have the repo? Just run `npm install` inside it once.

### 2. Enable the agent tools

Add the plugin to your global `opencode.jsonc` (create the file if it does not
exist):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["C:/Users/you/opencode-file-browser"]
}
```

On macOS/Linux use the absolute path instead, for example
`"/home/you/opencode-file-browser"`.

### 3. Enable the `/files` dialog

Add the same path to your global `tui.json`:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["C:/Users/you/opencode-file-browser"]
}
```

### 4. Restart opencode

Config and plugins are loaded at startup. Quit opencode completely and start it
again, then type `/files`.

That is the whole install. No environment variables, no build step, no global
npm package.

### Project-local install (optional)

If you only want the plugin in one repository, put the plugin folder inside that
repository and reference it relatively:

```text
my-project/
  .opencode/
    file-browser/        <- this repo, with node_modules installed
    tui.json
  opencode.jsonc
```

`my-project/.opencode/tui.json`:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./file-browser"]
}
```

`my-project/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./.opencode/file-browser"]
}
```

Relative paths are resolved from the config file that contains them.

### From npm (after publishing)

Once the package is published, opencode can install it on demand:

```jsonc
{
  "plugin": ["opencode-file-browser"]
}
```

The package is **not published yet**, so use the local-folder install above.

### Updating

```sh
cd /path/to/opencode-file-browser
git pull
npm install
```

Restart opencode after updating.

### Uninstalling

Remove the path from `opencode.jsonc` and `tui.json`, restart opencode, and
delete the cloned folder.

---

## Usage

### Open the browser

Any of these opens the dialog:

- Type `/files` in the prompt.
- Type an alias: `/browse`, `/fb`, or `/file`.
- Press `Ctrl+P`, then choose **File browser** (group **File**).
- Type `files` in the command palette.

The dialog opens at:

- the directory of the current session, when you are in a session, or
- the current project directory, when you are on the home screen.

The folder you navigate to is remembered per project, so `/files` reopens where
you left off.

### Keys

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move the selection |
| Type | Fuzzy-search titles and categories |
| `Enter` | Open the selected folder, preview a file, or run an action |
| `Esc` | Close the dialog |

Entries are grouped into **Navigate**, **Actions**, **Folders**, and **Files**.

### Actions

Each directory shows these actions at the top:

- **Switch project to this folder**
  - In a session: moves the current session to the chosen folder. Local file
    changes are not moved; the session simply points at the new directory.
  - On the home screen (or if the move endpoint is unavailable): opens a new
    session in that folder.
  - The switched folder becomes the browser's remembered root for the old
    project, so `/files` keeps opening there.
- **Copy this folder path**
  - Copies the absolute path using OSC52, then also tries the native clipboard
    (`Set-Clipboard`/`clip.exe`, `pbcopy`, `wl-copy`, `xclip`, `xsel`).
  - Shows a warning toast with the path if no clipboard is available.
- **Open in a new terminal**
  - Starts a fresh `opencode` in that folder.
  - Windows: `cmd /c start` (the new window inherits the folder as its cwd).
  - macOS: Terminal via `osascript`.
  - Linux: the first available of `x-terminal-emulator`, `gnome-terminal`,
    `konsole`, `xterm`.
  - Override the executable with `OPENCODE_BIN=/path/to/opencode`.

Folders open in place. Files show a preview dialog with their content (binary
files are labelled, and text is capped at 80 KB). Closing the preview returns to
the same folder.

### Agent tools

Ask the agent naturally, or call the tools directly:

- **`file_tree`** — project tree.
  - `path` (optional): relative folder to start from.
  - `depth` (optional string, default `"3"`): clamp to 0–10.
  - `showHidden` (optional `"true"`/`"false"`): include dotfiles.
  - Example prompts: “show the project tree”, “list `src` two levels deep”.
- **`file_open`** — read a text file.
  - `path` (required): relative to the project root.
  - Binary files return a size label instead of bytes. Text is truncated at
    80 KB.
  - Example prompts: “open `package.json`”, “show me `src/tui.ts`”.
- **`file_search`** — find files by name.
  - `query` (required): case-insensitive substring of the file name.
  - `path` (optional): restrict to a relative subfolder.
  - `showHidden` (optional): include dotfiles.
  - Results are capped at 200.
  - Example prompts: “find files named config”, “search for `*.test.ts` in `src`”.

All tool paths are resolved inside the project root (`worktree` when in a git
repo, otherwise `directory`). Attempts to escape with `..` are rejected.

### Example session

```text
/files
  → switch to ../my-other-project
  → copy path
  → open src/
  → preview tui.ts
```

Then ask the agent: “show me the tree of the project, skip hidden files”.

---

## Troubleshooting

- **`/files` does not appear.**
  - The TUI plugin goes in `tui.json`, not only `opencode.jsonc`.
  - Check the path is absolute or starts with `.`.
  - Restart opencode after editing config.
- **The agent tools are missing.**
  - Add the plugin to `opencode.json(c)` as well. That file controls server
    plugins.
- **`Could not switch to ...`.**
  - The folder must exist and be readable.
  - Session moves require a recent 1.x build; older builds fall back to opening
    a new session automatically.
- **Copy says “Clipboard unavailable”.**
  - The toast includes the path so it can be copied manually.
  - On Linux install `wl-clipboard`, `xclip`, or `xsel`.
- **“Open in a new terminal” fails.**
  - Make sure `opencode` is on `PATH`, or set `OPENCODE_BIN`.
- **Plugin fails to load.**
  - Run `npm install` inside the plugin folder.
  - Check the log at `~/.local/share/opencode/log/opencode.log` (Windows:
    `C:\Users\<you>\.local\share\opencode\log\opencode.log`) for lines starting
    with `[tui.plugin]`.
- **JSON path errors on Windows.**
  - Escape backslashes (`"D:\\tools\\plugin"`) or use forward slashes
    (`"D:/tools/plugin"`).

---

## Development

```sh
npm install
npm run typecheck
```

- `src/index.ts` is the server half (`file_tree`, `file_open`, `file_search`).
- `src/tui.ts` is the TUI half (`/files` dialog and actions).
- `package.json` exposes them as `./server` and `./tui`, which is what opencode
  loads.

To test changes in a real opencode instance, point both config files at this
folder and restart opencode after editing the plugin.

---

## Security and scope

- Agent tools cannot read outside the project root.
- The TUI browser itself can browse any readable directory on the machine,
  including outside the project, because you are choosing folders manually.
- “Switch project” changes the working directory of the current session; it does
  not copy, delete, or move files.
- Nothing is sent anywhere; the plugin only reads the filesystem, writes to the
  clipboard, and launches a terminal.

---

## Disclaimer

This software is provided **"AS IS"**, free of charge, for professional and
personal use. It is released under the MIT license, which carries no warranty
of any kind. **The author and contributors accept no responsibility or
liability for any harm, loss, data corruption, or damage** arising from the
use of this software, to the fullest extent permitted by law. Use at your own
risk.

## License

[MIT](./LICENSE)
