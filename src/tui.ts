import type { TuiDialogSelectOption, TuiPlugin } from "@opencode-ai/plugin/tui"
import { spawn } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

type Option = {
  title: string
  value: string
  description?: string
  category?: string
}

type View = {
  dir: string
  parent: string
  filter: string
  selected: Option
  active: boolean
}

const MAX_OPEN_BYTES = 80 * 1024
const MAX_ENTRIES = 500

function isText(bytes: Uint8Array): boolean {
  for (let i = 0; i < Math.min(bytes.length, 8192); i++) {
    if (bytes[i] === 0) return false
  }
  return true
}

function listDirectory(dir: string): Option[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  entries.sort((a, b) => {
    const ad = a.isDirectory() ? 0 : 1
    const bd = b.isDirectory() ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name.localeCompare(b.name)
  })

  const options: Option[] = []
  for (const entry of entries) {
    if (options.length >= MAX_ENTRIES) break
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      options.push({ title: entry.name + "/", value: "dir:" + full, category: "Folders" })
    } else {
      options.push({ title: entry.name, value: "file:" + full, category: "Files" })
    }
  }
  return options
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function run(bin: string, args: string[], input?: string): Promise<boolean> {
  return new Promise((done) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      done(ok)
    }
    try {
      const child = spawn(bin, args, {
        stdio: [input === undefined ? "ignore" : "pipe", "ignore", "ignore"],
        windowsHide: true,
      })
      child.once("error", () => finish(false))
      child.once("close", (code) => finish(code === 0))
      if (input !== undefined) child.stdin?.end(input)
    } catch {
      finish(false)
    }
  })
}

async function nativeCopy(text: string): Promise<boolean> {
  if (process.platform === "win32") {
    const script = "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())"
    if (await run("powershell.exe", ["-NonInteractive", "-NoProfile", "-Command", script], text)) return true
    return run("clip.exe", [], text)
  }
  if (process.platform === "darwin") {
    const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    return run("osascript", ["-e", `set the clipboard to "${escaped}"`])
  }
  if (process.env.WAYLAND_DISPLAY && (await run("wl-copy", [], text))) return true
  if (await run("xclip", ["-selection", "clipboard"], text)) return true
  return run("xsel", ["--clipboard", "--input"], text)
}

function launch(bin: string, args: string[], dir: string): Promise<boolean> {
  return new Promise((done) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      done(ok)
    }
    try {
      const child = spawn(bin, args, { cwd: dir, detached: true, stdio: "ignore", windowsHide: false })
      child.once("spawn", () => {
        child.unref()
        finish(true)
      })
      child.once("error", () => finish(false))
    } catch {
      finish(false)
    }
  })
}

async function openInNewTerminal(dir: string): Promise<boolean> {
  const command = process.env.OPENCODE_BIN || "opencode"

  if (process.platform === "win32") {
    return launch("cmd.exe", ["/c", "start", "", "cmd.exe", "/k", command], dir)
  }

  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'"
  const script = `cd ${quote(dir)} && ${command}`

  if (process.platform === "darwin") {
    return launch("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(script)}`], dir)
  }

  const candidates: Array<[string, string[]]> = [
    ["x-terminal-emulator", ["-e", "sh", "-c", script]],
    ["gnome-terminal", ["--", "sh", "-c", script]],
    ["konsole", ["-e", "sh", "-c", script]],
    ["xterm", ["-e", "sh", "-c", script]],
  ]
  for (const [bin, args] of candidates) {
    if (await launch(bin, args, dir)) return true
  }
  return false
}

const tui: TuiPlugin = async (api) => {
  let view: View | undefined

  const currentRoot = (): string => {
    const route = api.route.current
    if (route.name === "session" && typeof route.params?.sessionID === "string") {
      const sessionID = route.params.sessionID
      const session = api.state.session.get(sessionID)
      if (session?.directory) return resolve(session.directory)
      const remembered = api.kv.get<string>("file-browser.last:" + sessionID)
      if (typeof remembered === "string" && remembered.trim()) return resolve(remembered)
    }
    const path = api.state.path
    return resolve(path.worktree || path.directory || process.cwd())
  }

  const storedRoot = (root: string): string => {
    const value = api.kv.get<string>("file-browser.root:" + root)
    if (typeof value === "string" && value.trim()) {
      try {
        if (statSync(value).isDirectory()) return resolve(value)
      } catch {
        // Ignore stale browser roots and fall back to the project root.
      }
    }
    return root
  }

  const copyPath = async (dir: string): Promise<boolean> => {
    let osc52 = false
    try {
      osc52 = api.renderer.copyToClipboardOSC52(dir)
    } catch {
      // Fall through to the native clipboard helper.
    }
    const native = await nativeCopy(dir)
    return osc52 || native
  }

  const showFile = (file: string, returnDir: string): void => {
    let message: string
    try {
      const st = statSync(file)
      if (st.isDirectory()) {
        message = `"${file}" is a directory — choose it to open the folder.`
      } else {
        const bytes = readFileSync(file)
        if (!isText(bytes)) {
          message = `[binary file: ${st.size} bytes] ${file}`
        } else {
          let text = bytes.toString("utf8")
          if (bytes.length > MAX_OPEN_BYTES) text = text.slice(0, MAX_OPEN_BYTES) + "\n… (truncated)"
          message = `--- ${file} (${bytes.length} bytes) ---\n\n${text}`
        }
      }
    } catch (error) {
      message = errorMessage(error)
    }
    api.ui.dialog.replace(
      () => api.ui.DialogAlert({ title: basename(file), message }),
      () => setTimeout(() => browse(returnDir), 0),
    )
  }

  const switchProject = async (dir: string): Promise<void> => {
    const from = currentRoot()
    api.ui.dialog.clear()
    const route = api.route.current
    try {
      if (route.name === "session" && typeof route.params?.sessionID === "string") {
        const sessionID = route.params.sessionID
        try {
          await api.client.experimental.controlPlane.moveSession(
            { sessionID, destination: { directory: dir }, moveChanges: false },
            { throwOnError: true },
          )
          api.kv.set("file-browser.root:" + from, dir)
          api.kv.set("file-browser.last:" + sessionID, dir)
          api.ui.toast({ title: "File browser", message: `Switched this session to ${dir}`, variant: "success" })
          return
        } catch {
          // Fall back to opening a fresh session in the chosen folder below.
        }
      }

      const created = await api.client.session.create({ directory: dir }, { throwOnError: true })
      const session = created.data
      if (!session) throw new Error("No session was returned")
      api.kv.set("file-browser.root:" + from, dir)
      api.kv.set("file-browser.last:" + session.id, dir)
      api.route.navigate("session", { sessionID: session.id })
      api.ui.toast({ title: "File browser", message: `Opened ${dir} in a new session`, variant: "success" })
    } catch (error) {
      api.ui.toast({
        title: "File browser",
        message: `Could not switch to ${dir}\n\n${errorMessage(error)}`,
        variant: "error",
      })
    }
  }

  const promptFolder = (folder: string, fromDir: string): void => {
    let decided = false
    const choices: Option[] = [
      { title: "Navigate into folder", value: "nav", category: "Folder", description: folder },
      {
        title: "Open in a new terminal",
        value: "terminal",
        category: "Folder",
        description: `opencode in ${folder}`,
      },
      { title: "Cancel", value: "cancel", category: "Folder", description: "Stay in the current folder" },
    ]

    api.ui.dialog.replace(
      () =>
        api.ui.DialogSelect<string>({
          title: `Folder — ${basename(folder)}`,
          placeholder: "Choose what to do",
          options: choices,
          onSelect: (option: TuiDialogSelectOption<string>) => {
            decided = true
            if (option.value === "nav") {
              browse(folder)
              return
            }
            if (option.value === "terminal") {
              browse(fromDir)
              void openInNewTerminal(folder).then((opened) => {
                api.ui.toast({
                  title: "File browser",
                  message: opened
                    ? `Opening a terminal in ${folder}`
                    : `Could not open a terminal. Run: opencode "${folder}"`,
                  variant: opened ? "success" : "error",
                })
              })
              return
            }
            browse(fromDir)
          },
        }),
      () => {
        if (decided) return
        setTimeout(() => browse(fromDir), 0)
      },
    )
  }

  const browse = (start: string): void => {
    const dir = resolve(start)
    let entries: Option[]
    try {
      entries = listDirectory(dir)
    } catch (error) {
      api.ui.toast({
        title: "File browser",
        message: `Cannot read ${dir}: ${errorMessage(error)}`,
        variant: "error",
      })
      return
    }

    const parent = dirname(dir)
    const options: Option[] = []
    if (parent !== dir) options.push({ title: "..", value: "up", category: "Navigate" })
    options.push({
      title: "Switch project to this folder",
      value: "set-root",
      category: "Actions",
      description: dir,
    })
    options.push({
      title: "Copy this folder path",
      value: "copy-path",
      category: "Actions",
      description: dir,
    })
    options.push({
      title: "Open in a new terminal",
      value: "new-terminal",
      category: "Actions",
      description: `opencode in ${dir}`,
    })
    options.push(...entries)

    const current: View = {
      dir,
      parent,
      filter: "",
      selected: options[0],
      active: true,
    }
    view = current

    api.ui.dialog.replace(
      () =>
        api.ui.DialogSelect<string>({
          title: `Files — ${dir}`,
          placeholder: "Search folders and files",
          options,
          onMove: (option: TuiDialogSelectOption<string>) => {
            if (view === current) current.selected = option
          },
          onFilter: (query: string) => {
            if (view === current) current.filter = query
          },
          onSelect: (option: TuiDialogSelectOption<string>) => {
            if (view !== current) return
            const value = option.value
            if (value === "up") {
              browse(parent)
              return
            }
            if (value === "set-root") {
              void switchProject(dir)
              return
            }
            if (value === "copy-path") {
              void copyPath(dir).then((copied) => {
                api.ui.toast({
                  title: "File browser",
                  message: copied ? `Copied ${dir}` : `Clipboard unavailable. Path: ${dir}`,
                  variant: copied ? "success" : "warning",
                })
              })
              return
            }
            if (value === "new-terminal") {
              void openInNewTerminal(dir).then((opened) => {
                api.ui.toast({
                  title: "File browser",
                  message: opened ? `Opening a terminal in ${dir}` : `Could not open a terminal. Run: opencode "${dir}"`,
                  variant: opened ? "success" : "error",
                })
              })
              return
            }
            if (value.startsWith("dir:")) {
              promptFolder(value.slice(4), dir)
              return
            }
            if (value.startsWith("file:")) {
              current.active = false
              showFile(value.slice(5), dir)
            }
          },
        }),
      () => {
        current.active = false
      },
    )
    api.ui.dialog.setSize("xlarge")
  }

  const back = (): void | false => {
    if (!api.ui.dialog.open || !view?.active || view.filter.length > 0) return false
    if (view.parent === view.dir) return false
    browse(view.parent)
  }

  const forward = (): void | false => {
    if (!api.ui.dialog.open || !view?.active || view.filter.length > 0) return false
    const option = view.selected
    if (!option || !option.value.startsWith("dir:")) return false
    browse(option.value.slice(4))
  }

  api.keymap.registerLayer({
    commands: [
      {
        name: "file-browser.open",
        title: "File browser",
        desc: "Browse folders and open files",
        category: "File",
        namespace: "palette",
        slashName: "files",
        slashAliases: ["browse", "fb", "file"],
        suggested: true,
        run() {
          const root = currentRoot()
          browse(storedRoot(root))
        },
      },
      {
        name: "file-browser.back",
        title: "File browser: back",
        desc: "Go to the parent folder",
        category: "File",
        run: back,
      },
      {
        name: "file-browser.forward",
        title: "File browser: open folder",
        desc: "Enter the selected folder",
        category: "File",
        run: forward,
      },
    ],
    bindings: [
      ...api.tuiConfig.keybinds.gather("file-browser.palette", ["file-browser.open"]),
      { key: "left", desc: "Back", group: "File browser", cmd: "file-browser.back", preventDefault: false },
      { key: "right", desc: "Open folder", group: "File browser", cmd: "file-browser.forward", preventDefault: false },
    ],
  })
}

export default { id: "opencode-file-browser.tui", tui }
