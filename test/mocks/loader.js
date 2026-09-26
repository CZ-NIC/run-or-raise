// Node module hooks: resolve the GNOME Shell-only imports (`gi://…`, `resource:///…`)
// to the mocks in this directory, so that the extension code can run under `node --test`.
import { register } from "node:module"

const MOCKS = {
  "gi://GLib": "gi.js",
  "gi://Gio": "gi.js",
  "gi://Shell": "gi.js",
  "gi://Mtk": "gi.js",
  "gi://Meta": "gi.js",
  "gi://St": "gi.js",
  "gi://Clutter": "gi.js",
  "resource:///org/gnome/shell/ui/main.js": "main.js",
  "resource:///org/gnome/shell/extensions/extension.js": "extension.js",
}

const hooks = `
const MOCKS = ${JSON.stringify(MOCKS)}
const base = ${JSON.stringify(new URL(".", import.meta.url).href)}
export async function resolve(specifier, context, next) {
  if (specifier in MOCKS) {
    const name = specifier.split("://")[1]
    // one mock file exports every gi library as a named export, wrap it as a default export
    const url = new URL(MOCKS[specifier], base)
    if (specifier.startsWith("gi://")) {
      url.searchParams.set("lib", name)
    }
    return { url: url.href, shortCircuit: true }
  }
  return next(specifier, context)
}
export async function load(url, context, next) {
  const lib = new URL(url).searchParams.get("lib")
  if (lib) {
    const source = "import * as gi from " + JSON.stringify(url.split("?")[0]) + "; export default gi." + lib
    return { format: "module", source, shortCircuit: true }
  }
  return next(url, context)
}
`

register("data:text/javascript," + encodeURIComponent(hooks))
