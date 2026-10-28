import { Plugin } from "@opencode/plugin"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

const MAX_TREE_ENTRIES = 500
const MAX_OPEN_BYTES = 80 * 1024
const MAX_SEARCH_RESULTS = 200
const DEFAULT_DEPTH = 3

function toBool(value?: string): boolean {
  return value === "true" || value === "1"
}

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
  let entries: any[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  entries.sort((a: any, b: any) => {
    const ad = a.isDirectory() ? 0 : 1
    const bd = b.isDirectory() ? 0 : 1
    if (ad !== bd) return ad - bd
    return String(a.name).localeCompare(String(b.name))
  })

  for (const entry of entries) {
    if (out.length >= MAX_TREE_ENTRIES) {
      out.push(prefix + "… (truncated)")
      return
    }
    if (!showHidden && String(entry.name).startsWith(".")) continue

    const full = join(dir, String(entry.name))
    const relName = relative(root, full)
    if (entry.isDirectory()) {
      out.push(prefix + relName + sep)
      buildTree(root, full, depth - 1, showHidden, out, prefix + "  ")
    } else {
      out.push(prefix + relName)
    }
  }
}

function searchFiles(
  root: string,
  dir: string,
  query: string,
  showHidden: boolean,
  out: string[],
): void {
  if (out.length >= MAX_SEARCH_RESULTS) return
  let entries: any[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_SEARCH_RESULTS) return
    if (!showHidden && String(entry.name).startsWith(".")) continue
    const full = join(dir, String(entry.name))
    if (entry.isDirectory()) {
      searchFiles(root, full, query, showHidden, out)
    } else if (String(entry.name).toLowerCase().includes(query)) {
      out.push(relative(root, full))
    }
  }
}

export default Plugin.define({
  id: "opencode-file-browser",
  async setup(ctx) {
    const root = resolve(ctx.location?.directory ?? process.cwd())

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "file_tree",
        description:
          "Browse the project as a folder/file tree. Optional relative `path`, `depth` (default 3), and `showHidden`.",
        input: {
          type: "object",
          properties: {
            path: { type: "string" },
            depth: { type: "string" },
            showHidden: { type: "string" },
          },
          additionalProperties: false,
        },
        async execute(input) {
          const args = input as { path?: string; depth?: string; showHidden?: string }
          const depth = Math.max(
            0,
            Math.min(10, Number.parseInt(args.depth ?? String(DEFAULT_DEPTH), 10) || DEFAULT_DEPTH),
          )
          const target = safePath(root, args.path)
          const out: string[] = []
          buildTree(root, target, depth, toBool(args.showHidden), out, "")
          return { content: `Project root: ${root}\n` + (out.length ? out.join("\n") : "(empty)") }
        },
      })

      editor.add({
        name: "file_open",
        description: "Open and return the text content of a file inside the project. `path` is relative to the project root.",
        input: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false,
        },
        async execute(input) {
          const args = input as { path: string }
          const target = safePath(root, args.path)
          const st = statSync(target)
          if (st.isDirectory()) throw new Error(`"${args.path}" is a directory — use file_tree to list it.`)
          const bytes = readFileSync(target)
          if (!isText(bytes)) return { content: `[binary file: ${st.size} bytes] ${args.path}` }
          let text = bytes.toString("utf8")
          let truncated = false
          if (bytes.length > MAX_OPEN_BYTES) {
            text = text.slice(0, MAX_OPEN_BYTES)
            truncated = true
          }
          const lines = text.split(/\r?\n/).length
          return {
            content:
              `--- ${args.path} (${bytes.length} bytes, ${lines} lines) ---\n` +
              text +
              (truncated ? `\n… (truncated at ${MAX_OPEN_BYTES} bytes)` : ""),
          }
        },
      })

      editor.add({
        name: "file_search",
        description: "Find files by name (case-insensitive substring). Optional relative `path` and `showHidden`.",
        input: {
          type: "object",
          properties: {
            query: { type: "string" },
            path: { type: "string" },
            showHidden: { type: "string" },
          },
          required: ["query"],
          additionalProperties: false,
        },
        async execute(input) {
          const args = input as { query: string; path?: string; showHidden?: string }
          const query = (args.query ?? "").trim().toLowerCase()
          if (!query) throw new Error("file_search requires a non-empty `query`.")
          const start = safePath(root, args.path)
          const results: string[] = []
          searchFiles(root, start, query, toBool(args.showHidden), results)
          const truncated = results.length >= MAX_SEARCH_RESULTS
          return {
            content:
              `Found ${results.length} file(s) matching "${query}"${truncated ? " (capped)" : ""}:\n` +
              (results.length ? results.join("\n") : "(none)"),
          }
        },
      })
    })
  },
})
