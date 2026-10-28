import { Plugin } from "@opencode/plugin/tui"
import { readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

type Option = {
  title: string
  value: string
  description?: string
  category?: string
}

function listDirectory(dir: string): Option[] {
  const entries: any[] = readdirSync(dir, { withFileTypes: true })
  entries.sort((a: any, b: any) => {
    const ad = a.isDirectory() ? 0 : 1
    const bd = b.isDirectory() ? 0 : 1
    if (ad !== bd) return ad - bd
    return String(a.name).localeCompare(String(b.name))
  })

  const options: Option[] = []
  for (const entry of entries) {
    const name = String(entry.name)
    const full = join(dir, name)
    if (entry.isDirectory()) {
      options.push({ title: name + "/", value: "dir:" + full, category: "Folders" })
    } else {
      options.push({ title: name, value: "file:" + full, category: "Files" })
    }
  }
  return options
}

function clamp(text: string, max = 6000): string {
  return text.length > max ? text.slice(0, max) + "\n… (truncated)" : text
}

export default Plugin.define({
  id: "opencode-file-browser.tui",
  async setup(context) {
    const initial = resolve(context.location?.directory ?? process.cwd())
    const [stored, updateStored] = context.storage.store("browser", {
      initial: { root: initial },
    })

    const readRoot = (): string => {
      try {
        const value: any = stored
        const state = typeof value === "function" ? value() : value
        if (state && typeof state.root === "string" && state.root.length > 0) {
          return resolve(state.root)
        }
      } catch {
        /* fall through */
      }
      return initial
    }

    const browse = async (): Promise<void> => {
      let dir = readRoot()

      for (;;) {
        const root = readRoot()
        let entries: Option[]
        try {
          entries = listDirectory(dir)
        } catch (error) {
          await context.ui.dialog.alert({
            title: "File browser",
            message: `Cannot read ${dir}\n\n${String(error)}`,
          })
          return
        }

        const options: Option[] = []
        if (dir !== root) {
          options.push({ title: "..", value: "up", category: "Navigate" })
        }
        options.push({
          title: "Set this folder as project root",
          value: "set-root",
          category: "Actions",
          description: dir,
        })
        options.push(...entries)

        const selected = await context.ui.dialog.select({
          title: `Files — ${dir}`,
          options,
          search: (query: string, all: Option[]) =>
            all.filter((option) => option.title.toLowerCase().includes(query.toLowerCase())),
        })

        if (!selected) return

        if (selected === "up") {
          dir = dirname(dir)
          continue
        }

        if (selected === "set-root") {
          await updateStored((draft: any) => {
            draft.root = dir
          })
          await context.ui.toast.show({
            title: "File browser",
            message: "Project root set to " + dir,
            variant: "success",
          })
          return
        }

        if (selected.startsWith("dir:")) {
          dir = selected.slice(4)
          continue
        }

        if (selected.startsWith("file:")) {
          const path = selected.slice(5)
          let content: string
          try {
            content = readFileSync(path, "utf8")
          } catch (error) {
            content = String(error)
          }
          await context.ui.dialog.alert({
            title: basename(path),
            message: clamp(content),
          })
          continue
        }
      }
    }

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "opencode-file-browser.open",
          title: "File browser",
          group: "File",
          palette: true,
          slash: { name: "files", aliases: ["browse"] },
          enabled: () => true,
          run: () => browse(),
        },
      ],
    }))
  },
})
