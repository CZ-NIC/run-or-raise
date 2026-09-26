// After launching, the action watches for the new window to focus it (Wayland focus-stealing
// prevention workaround). The watch must never leak signal handlers or main loop sources.
import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { reset, fakeApp, Window } from "./mocks/shell.js"
import { GLib } from "./mocks/gi.js"
import * as Main from "./mocks/main.js"
import { parseLine } from "../lib/action.js"

let app, display
beforeEach(() => {
  display = reset()
  app = fakeApp()
})

const GIVE_UP = 10_000
const POLL = 100

function launch(line = "<Super>f,firefox,firefox,") {
  const action = parseLine(line, app)
  action.trigger()
  return action
}

/** Window appears as the compositor would announce it */
function create(window) {
  display.windows.push(window)
  display.emit("window-created", window)
  return window
}

function assertClean(action, ...windows) {
  assert.equal(display.handler_count(), 0, "display handlers left")
  for (const w of windows) {
    assert.equal(w.actor.handler_count(), 0, "actor handlers left")
  }
  assert.equal(GLib._pending(), 0, "main loop sources left")
  assert.equal(app.watching_actions.has(action), false)
}

test("launch starts watching", () => {
  const a = launch()
  assert.equal(display.handler_count("window-created"), 1)
  assert.equal(display.handler_count("window-demands-attention"), 1)
  assert.equal(GLib._pending(GIVE_UP), 1)
  assert.ok(app.watching_actions.has(a))
})

test("new window is focused after its first frame", () => {
  const a = launch()
  const w = create(new Window({ wm_class: "firefox" }))
  assert.equal(
    Main.activated.length,
    0,
    "must not focus before the first frame",
  )
  w.actor.emit("first-frame")
  assert.deepEqual(Main.activated, [w])
  assertClean(a, w)
})

test("window without a workspace yet is polled", () => {
  const a = launch()
  const w = create(new Window({ wm_class: "firefox", workspace: null }))
  w.actor.emit("first-frame")
  assert.equal(GLib._pending(POLL), 1)

  GLib._fire_all(POLL)
  assert.equal(GLib._pending(POLL), 1, "still polling")

  w.workspace = "ws0"
  GLib._fire_all(POLL)
  assert.deepEqual(Main.activated, [w])
  assertClean(a, w)
})

test("polling gives up but the watch stays until the timeout", () => {
  const a = launch()
  const w = create(new Window({ wm_class: "other" }))
  w.actor.emit("first-frame")
  for (let i = 0; i < 20; i++) {
    GLib._fire_all(POLL)
  }
  assert.equal(GLib._pending(POLL), 0)
  assert.equal(display.handler_count(), 2)

  GLib._fire_all(GIVE_UP)
  assertClean(a, w)
})

test("non-conforming windows are ignored", () => {
  launch()
  const w = create(new Window({ wm_class: "other" }))
  w.actor.emit("first-frame")
  GLib._fire_all(POLL)
  display.emit("window-demands-attention", w)
  assert.equal(Main.activated.length, 0)
})

test("window without a compositor actor is tried at once", () => {
  const a = launch()
  const w = new Window({ wm_class: "firefox" })
  w.actor = null
  create(w)
  assert.deepEqual(Main.activated, [w])
  assertClean(a)
})

test("single-instance app demanding attention is focused", () => {
  // already running elsewhere, not visible to trigger() on the active workspace
  const a = launch("<Super>f:isolate-workspace,firefox,firefox,")
  const w = new Window({ wm_class: "firefox" })
  display.emit("window-demands-attention", w)
  assert.deepEqual(Main.activated, [w])
  assertClean(a)
})

test("give up after the timeout", () => {
  const a = launch()
  GLib._fire_all(GIVE_UP)
  assertClean(a)

  // a window appearing later is not stolen focus
  const w = create(new Window({ wm_class: "firefox" }))
  w.actor.emit("first-frame")
  assert.equal(Main.activated.length, 0)
})

test("launching again replaces the previous watch", () => {
  const a = parseLine("<Super>f,firefox,firefox,", app)
  a.trigger()
  a.trigger()
  a.trigger()
  assert.equal(display.handler_count(), 2)
  assert.equal(GLib._pending(), 1)

  const w = create(new Window({ wm_class: "firefox" }))
  w.actor.emit("first-frame")
  assert.equal(Main.activated.length, 1)
  assertClean(a, w)
})

test("another window being created restarts polling", () => {
  const a = launch()
  const w1 = create(new Window({ wm_class: "other" }))
  w1.actor.emit("first-frame")
  const w2 = create(new Window({ wm_class: "firefox", workspace: null }))
  w2.actor.emit("first-frame")
  assert.equal(GLib._pending(POLL), 1)

  w2.workspace = "ws0"
  GLib._fire_all(POLL)
  assert.deepEqual(Main.activated, [w2])
  assertClean(a, w1, w2)
})

test("different actions watch independently", () => {
  const a = launch("<Super>f,firefox,firefox,")
  const b = launch("<Super>t,gnome-terminal,Gnome-terminal,")
  assert.equal(display.handler_count(), 4)

  const w = create(new Window({ wm_class: "Gnome-terminal" }))
  w.actor.emit("first-frame")
  assert.deepEqual(Main.activated, [w])
  assert.equal(display.handler_count(), 2, "only the terminal watch is gone")
  assert.ok(app.watching_actions.has(a))
  assert.ok(!app.watching_actions.has(b))
})

test("destroy while waiting for the first frame", () => {
  const a = launch()
  const w = create(new Window({ wm_class: "firefox" }))
  assert.equal(w.actor.handler_count(), 1)
  a.destroy()
  assertClean(a, w)
  w.actor.emit("first-frame")
  assert.equal(Main.activated.length, 0)
})

test("destroy while polling", () => {
  const a = launch()
  const w = create(new Window({ wm_class: "firefox", workspace: null }))
  w.actor.emit("first-frame")
  a.destroy()
  assertClean(a, w)
})

test("destroy is idempotent and safe without a watch", () => {
  const a = parseLine("<Super>f,firefox,firefox,", app)
  a.destroy()
  launch().destroy()
  a.destroy()
  assert.equal(GLib._pending(), 0)
})
