import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { reset, fakeApp, Settings } from "./mocks/shell.js"
import { parseLine } from "../lib/action.js"
import { Mode } from "../lib/mode.js"

let app
beforeEach(() => {
  reset()
  app = fakeApp()
})

test("shortcut, command, wm_class and title", () => {
  const a = parseLine("<Super>f,firefox,Firefox,Mozilla", app)
  assert.equal(a.shortcut, "<Super>f")
  assert.equal(a.command, "firefox")
  assert.equal(a.wm_class, "Firefox")
  assert.equal(a.wmFn, "indexOf")
  assert.equal(a.title, "Mozilla")
  assert.equal(a.titleFn, "indexOf")
  assert.deepEqual(a.layers, [])
  assert.equal(a.mode.get(Mode.RUN_ONLY), false)
})

test("whitespace around the fields is trimmed", () => {
  const a = parseLine(" <Super>f , firefox , Firefox , ", app)
  assert.equal(a.shortcut, "<Super>f")
  assert.equal(a.command, "firefox")
  assert.equal(a.wm_class, "Firefox")
  assert.equal(a.title, "")
})

test("only shortcut and command means run-only", () => {
  assert.equal(
    parseLine("<Super>t,gnome-terminal", app).mode.get(Mode.RUN_ONLY),
    true,
  )
  assert.equal(
    parseLine("<Super>t,gnome-terminal,", app).mode.get(Mode.RUN_ONLY),
    false,
  )
})

test("missing fields default to empty strings", () => {
  const a = parseLine(",firefox", app)
  assert.equal(a.shortcut, "")
  assert.equal(a.wm_class, "")
  assert.equal(a.title, "")
})

test("slash-surrounded wm_class and title are regular expressions", () => {
  const a = parseLine("<Super>f,firefox,/^Fire/,/Moz.*a/", app)
  assert.ok(a.wm_class instanceof RegExp)
  assert.equal(a.wm_class.source, "^Fire")
  assert.equal(a.wmFn, "search")
  assert.ok(a.title instanceof RegExp)
  assert.equal(a.titleFn, "search")
})

test("quoted field may contain commas", () => {
  const a = parseLine(
    '<Super>e,"sh -c \'echo a, b\'",,"title, with comma"',
    app,
  )
  assert.equal(a.command, "sh -c 'echo a, b'")
  assert.equal(a.wm_class, "")
  assert.equal(a.title, "title, with comma")
})

test("modes with and without arguments", () => {
  const a = parseLine("<Super>f:always-run:raise-or-register(3),firefox,,", app)
  assert.equal(a.shortcut, "<Super>f")
  assert.equal(a.mode.get(Mode.ALWAYS_RUN), true)
  assert.equal(a.mode.get(Mode.RAISE_OR_REGISTER), "3")
  assert.equal(a.mode.get(Mode.ISOLATE_WORKSPACE), false)
})

test("unknown mode throws", () => {
  assert.throws(
    () => parseLine("<Super>f:nonsense,firefox,,", app),
    /Unknown mode/,
  )
})

test("mode falls back to the global settings", () => {
  app = fakeApp(new Settings({ "isolate-workspace": true }))
  const a = parseLine("<Super>f,firefox,,", app)
  assert.equal(a.mode.get(Mode.ISOLATE_WORKSPACE), true)
  // modes that are not global settings keys
  assert.equal(a.mode.get(Mode.RAISE), false)
})

test("layered shortcut", () => {
  const a = parseLine("<Super>g a <Shift>b,firefox,,", app)
  assert.equal(a.shortcut, "<Super>g")
  assert.deepEqual(a.layers, ["a", "<Shift>b"])

  const b = a.get_layered_action()
  assert.equal(b.shortcut, "a")
  assert.deepEqual(b.layers, ["<Shift>b"])
  assert.equal(b.command, "firefox")
  assert.equal(b.mode, a.mode)

  const c = b.get_layered_action()
  assert.equal(c.shortcut, "<Shift>b")
  assert.deepEqual(c.layers, [])
})

test("keyboard lock modifiers are stripped from the shortcut", () => {
  const a = parseLine("<Num_Lock><Caps_Lock_OFF><Super>i,firefox,,", app)
  assert.equal(a.shortcut, "<Super>i")
  assert.deepEqual(a.get_state(), [true, false, null])

  assert.deepEqual(parseLine("<Super>i,firefox,,", app).get_state(), [
    null,
    null,
    null,
  ])
})

test("state_conforms ignores unset locks", () => {
  const a = parseLine("<Num_Lock><Super>i,firefox,,", app)
  assert.equal(a.state_conforms([true, false, false]), true)
  assert.equal(a.state_conforms([true, true, true]), true)
  assert.equal(a.state_conforms([false, false, false]), false)

  const b = parseLine("<Num_Lock_OFF><Scroll_Lock><Super>i,firefox,,", app)
  assert.equal(b.state_conforms([false, true, true]), true)
  assert.equal(b.state_conforms([false, true, false]), false)
})

test("every line of shortcuts.default parses", () => {
  const lines = readFileSync(
    new URL("../shortcuts.default", import.meta.url),
    "utf8",
  )
    .split("\n")
    .filter(line => line.trim() !== "" && line[0] !== "#")
  assert.ok(lines.length > 0)
  for (const line of lines) {
    const a = parseLine(line, app)
    assert.ok(a.shortcut, `no shortcut in: ${line}`)
    assert.ok(!/<(Num|Caps|Scroll)_Lock/.test(a.shortcut), line)
  }
})
