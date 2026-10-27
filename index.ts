import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { readdirSync, statSync, readFileSync } from "node:fs"
import { join, resolve, sep, relative } from "node:path"

const MAX_TREE_ENTRIES = 500
const MAX_OPEN_BYTES = 80 * 1024
const MAX_SEARCH_RESULTS = 200
const DEFAULT_DEPTH = 3

function toBool(value?: string): boolean {
  return value === "true" || value === "1"
}

function projectRoot(root: string): string {
  return resolve(root)
}

/**
 * Resolve a user-supplied relative path inside the project root.
 * Rejects anything that escapes the project directory.
 */
function safePath(root: string, rel?: string): string {
  const base = resolve(root)
  const target = rel && rel.trim().length > 0 ? resolve(base, rel.trim()) : base
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`Path is outside the project: ${rel}`)
  }
  return target
}

function isText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8192)
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) return false
  }
  return true
}

function buildTree(
  root: string,
  dir: string,
  depth: number,
  showHidden: boolean,
  out: string[],
  prefix: string,
): void {
  if (depth < 0 || out.length >= MAX_TREE_ENTRIES) return
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  entries.sort((a, b) => {
    const ad = a.isDirectory() ? 0 : 1
    const bd = b.isDirectory() ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name.localeCompare(b.name)
  })

  for (const entry of entries) {
    if (out.length >= MAX_TREE_ENTRIES) {
      out.push(prefix + "… (truncated)")
      return
    }
    if (!showHidden && entry.name.startsWith(".")) continue

    const full = join(dir, entry.name)
    const relName = relative(root, full)
    if (entry.isDirectory()) {
      out.push(prefix + relName + sep)
      buildTree(root, full, depth - 1, showHidden, out, prefix + "  ")
    } else {
      out.push(prefix + relName)
    }
  }
}

export const FileBrowserPlugin: Plugin = async ({ directory, worktree }) => {
  const root = projectRoot(worktree || directory)

  return {
    tool: {
      file_tree: tool({
        description:
          "Browse the project as a folder/file tree. Pass an optional relative `path` to start below a subfolder, " +
          "`depth` (default 3) to limit how deep it goes, and `showHidden` (\"true\"/\"false\") to include dotfiles. " +
          "Use this to explore the project structure before opening files.",
        args: {
          path: tool.schema.string().optional(),
          depth: tool.schema.string().optional(),
          showHidden: tool.schema.string().optional(),
        },
        async execute(args) {
          const depth = Math.max(0, Math.min(10, Number.parseInt(args.depth ?? String(DEFAULT_DEPTH), 10) || DEFAULT_DEPTH))
          const target = safePath(root, args.path)
          const out: string[] = []
          buildTree(root, target, depth, toBool(args.showHidden), out, "")
          return `Project root: ${root}\n` + (out.length ? out.join("\n") : "(empty)")
        },
      }),

      file_open: tool({
        description:
          "Open and return the text content of a file inside the project. The `path` is relative to the project root. " +
          "Use this after file_tree/file_search to read a specific file.",
        args: {
          path: tool.schema.string(),
        },
        async execute(args) {
          const target = safePath(root, args.path)
          const st = statSync(target)
          if (st.isDirectory()) {
            throw new Error(`"${args.path}" is a directory — use file_tree to list it.`)
          }
          const bytes = readFileSync(target)
          if (!isText(bytes)) {
            return `[binary file: ${st.size} bytes] ${args.path}`
          }
          let text = bytes.toString("utf8")
          let truncated = false
          if (bytes.length > MAX_OPEN_BYTES) {
            text = text.slice(0, MAX_OPEN_BYTES)
            truncated = true
          }
          const lines = text.split(/\r?\n/).length
          return (
            `--- ${args.path} (${bytes.length} bytes, ${lines} lines) ---\n` +
            text +
            (truncated ? `\n… (truncated at ${MAX_OPEN_BYTES} bytes)` : "")
          )
        },
      }),

      file_search: tool({
        description:
          "Find files in the project by name (case-insensitive substring match on the file name). " +
          "Pass an optional relative `path` to restrict the search to a subfolder, and `showHidden` to include dotfiles.",
        args: {
          query: tool.schema.string(),
          path: tool.schema.string().optional(),
          showHidden: tool.schema.string().optional(),
        },
        async execute(args) {
          const query = (args.query ?? "").trim().toLowerCase()
          if (!query) throw new Error("file_search requires a non-empty `query`.")
          const start = safePath(root, args.path)
          const showHidden = toBool(args.showHidden)
          const results: string[] = []

          const walk = (dir: string): void => {
            if (results.length >= MAX_SEARCH_RESULTS) return
            let entries: ReturnType<typeof readdirSync>
            try {
              entries = readdirSync(dir, { withFileTypes: true })
            } catch {
              return
            }
            for (const entry of entries) {
              if (results.length >= MAX_SEARCH_RESULTS) return
              if (!showHidden && entry.name.startsWith(".")) continue
              const full = join(dir, entry.name)
              if (entry.isDirectory()) {
                walk(full)
              } else if (entry.name.toLowerCase().includes(query)) {
                results.push(relative(root, full))
              }
            }
          }

          walk(start)
          const truncated = results.length >= MAX_SEARCH_RESULTS
          return (
            `Found ${results.length} file(s) matching "${query}"${truncated ? " (capped)" : ""}:\n` +
            (results.length ? results.join("\n") : "(none)")
          )
        },
      }),
    },
  }
}
