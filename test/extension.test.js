// Whole extension lifecycle: enable() grabs the accelerators, disable() must leave nothing behind.
import { test, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { reset, Window } from "./mocks/shell.js"
import { GLib, Gio, Shell } from "./mocks/gi.js"
import * as Main from "./mocks/main.js"
import RunOrRaiseExtension from "../extension.js"

const CONF = ".config/run-or-raise/shortcuts.conf"
const SHORTCUTS = `
# comment
<Super>f,firefox,firefox,
<Super>t,gnome-terminal,Gnome-terminal,
<Super>t:always-run,notify-send terminal
<Super>g a,gedit,gedit,
<Super>g b,notify-send layered
<Num_Lock><Super>n,notify-send numlock
<Super>x:nonsense,broken
`

let display, ext
beforeEach(() => {
  display = reset()
  Shell._files.set(CONF, SHORTCUTS)
  ext = new RunOrRaiseExtension({ path: "/ext" })
})
afterEach(() => {
  ext.disable()
})

function grabbed() {
  return [...display.grabbed.values()].sort()
}

/** Press the grabbed shortcut */
function press(shortcut) {
  const id = [...display.grabbed].find(([, s]) => s === shortcut)?.[0]
  assert.ok(id, `${shortcut} not grabbed`)
  display.emit("accelerator-activated", id, 0, 0)
}

function assertDisabled() {
  assert.deepEqual(grabbed(), [])
  assert.equal(display.handler_count(), 0, "display handlers left")
  assert.equal(GLib._pending(), 0, "main loop sources left")
  assert.equal(ext.app, null)
  for (const actor of Main.layoutManager.chrome) {
    assert.ok(actor.destroyed)
  }
}

test("enable grabs the accelerators, disable releases everything", () => {
  ext.enable()
  const keymap = ext.app.keymap
  assert.deepEqual(grabbed(), ["<Super>f", "<Super>g", "<Super>t"])
  assert.equal(Main.wm.allowed.size, 3)
  assert.ok(
    Main.notifications.some(([, text]) => text.includes("<Super>x:nonsense")),
    "unparsable line reported",
  )

  ext.disable()
  assertDisabled()
  assert.equal(keymap.handler_count(), 0)
})

test("pressing a shortcut raises or runs", () => {
  ext.enable()
  const ff = display.add(new Window({ wm_class: "firefox" }))
  press("<Super>f")
  assert.deepEqual(Main.activated, [ff])

  // both actions on the same shortcut
  press("<Super>t")
  assert.deepEqual(Gio.Subprocess.spawned, [
    ["gnome-terminal"],
    ["notify-send", "terminal"],
  ])
})

test("disable right after launching stops the focus watch", () => {
  ext.enable()
  press("<Super>f") // nothing to raise, launches and starts watching
  assert.ok(GLib._pending() > 0)

  ext.disable()
  assertDisabled()
})

test("disable stops the focus watch of a D-Bus call", () => {
  ext.enable()
  ext.Call(",firefox,firefox,")
  assert.ok(GLib._pending() > 0)
  ext.disable()
  assertDisabled()
})

test("disable stops the focus watch of a layered shortcut", () => {
  ext.enable()
  press("<Super>g")
  assert.deepEqual(grabbed(), ["<Super>f", "<Super>g", "<Super>t", "a", "b"])
  press("a")
  assert.deepEqual(Gio.Subprocess.spawned, [["gedit"]])
  assert.deepEqual(
    grabbed(),
    ["<Super>f", "<Super>g", "<Super>t"],
    "layer released",
  )
  assert.ok(GLib._pending() > 0)

  ext.disable()
  assertDisabled()
})

test("disable in the middle of a layered shortcut", () => {
  ext.enable()
  press("<Super>g")
  assert.equal(Main.layoutManager.chrome.length, 1)
  ext.disable()
  assertDisabled()
})

test("unknown key cancels the layered mode", () => {
  ext.enable()
  press("<Super>g")
  const listener = Main.layoutManager.chrome[0]
  listener.emit("key-press-event", { get_key_symbol: () => "KEY_z" })
  assert.ok(listener.destroyed)
  assert.deepEqual(grabbed(), ["<Super>f", "<Super>g", "<Super>t"])
})

test("modifier key keeps the layered mode", () => {
  ext.enable()
  press("<Super>g")
  const listener = Main.layoutManager.chrome[0]
  listener.emit("key-press-event", { get_key_symbol: () => "KEY_Shift_L" })
  assert.ok(!listener.destroyed)
})

test("lock-dependent shortcut is grabbed only in its keyboard state", () => {
  ext.enable()
  const keymap = ext.app.keymap
  assert.ok(!grabbed().includes("<Super>n"))

  keymap.num_lock = true
  keymap.emit("state-changed")
  assert.ok(grabbed().includes("<Super>n"))

  keymap.num_lock = false
  keymap.emit("state-changed")
  assert.ok(!grabbed().includes("<Super>n"))
})

test("missing config is read from the default", () => {
  Shell._files.clear()
  Shell._files.set("/ext/shortcuts.default", "<Super>f,firefox,firefox,")
  ext.enable()
  assert.ok(
    Main.notifications.some(([, text]) =>
      text.includes("creating new file from default"),
    ),
  )
  assert.deepEqual(grabbed(), ["<Super>f"])
})

test("disable after enable failed to read any config", () => {
  Shell._files.clear()
  ext.enable()
  assert.ok(
    Main.notifications.some(([, text]) =>
      text.includes("Failed to create the default file"),
    ),
  )
  ext.disable()
  assertDisabled()
})

test("enable and disable repeatedly", () => {
  for (let i = 0; i < 3; i++) {
    ext.enable()
    press("<Super>f")
    ext.disable()
    assertDisabled()
  }
})
