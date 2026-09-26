import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { reset, fakeApp, Settings, Window } from "./mocks/shell.js"
import { Gio, Shell } from "./mocks/gi.js"
import * as Main from "./mocks/main.js"
import { parseLine } from "../lib/action.js"

let app, display
beforeEach(() => {
  display = reset()
  app = fakeApp()
})

const firefox = (props = {}) =>
  new Window({
    wm_class: "firefox",
    wm_class_instance: "Navigator",
    title: "Mozilla Firefox",
    ...props,
  })
const terminal = (props = {}) =>
  new Window({
    wm_class: "Gnome-terminal",
    wm_class_instance: "gnome-terminal-server",
    title: "bash",
    ...props,
  })

test("is_conforming by wm_class, instance, title and command", () => {
  const ff = firefox()
  const t = terminal()
  const cases = [
    // line, firefox conforms, terminal conforms
    ["<Super>f,firefox,firefox,", true, false],
    ["<Super>f,x,Navigator,", true, false], // wm_class instance
    ["<Super>f,x,fire,", true, false], // substring
    ["<Super>f,x,Firefox,", false, false], // case sensitive
    ["<Super>f,x,firefox,Chrome", false, false], // wm_class AND title
    ["<Super>f,x,firefox,Mozilla", true, false],
    ["<Super>f,x,,bash", false, true], // title only
    ["<Super>f,x,/^Gnome/,", false, true], // regex
    ["<Super>f,x,,/^(?!bash).*$/", true, false], // negative regex
    ["<Super>f,FIREFOX,,", true, false], // command in wm_class, case insensitive
    ["<Super>f,Bash,,", false, true], // command in title
  ]
  for (const [line, ffExpected, tExpected] of cases) {
    const a = parseLine(line, app)
    assert.equal(a.is_conforming(ff), ffExpected, `${line} × firefox`)
    assert.equal(a.is_conforming(t), tExpected, `${line} × terminal`)
  }
})

test("is_conforming survives a window without wm_class and title", () => {
  const w = new Window({ wm_class: null, wm_class_instance: null, title: null })
  assert.equal(
    parseLine("<Super>f,firefox,firefox,", app).is_conforming(w),
    false,
  )
  assert.equal(parseLine("<Super>f,firefox,,", app).is_conforming(w), false)
})

test("raise the conforming window", () => {
  const ff = display.add(firefox())
  display.add(terminal(), true)
  parseLine("<Super>f,firefox,firefox,", app).trigger()
  assert.deepEqual(Main.activated, [ff])
  assert.equal(Gio.Subprocess.spawned.length, 0)
})

test("run the command when nothing conforms", () => {
  display.add(terminal(), true)
  parseLine("<Super>f,firefox -P default,firefox,", app).trigger()
  assert.deepEqual(Gio.Subprocess.spawned, [["firefox", "-P", "default"]])
  assert.equal(Main.activated.length, 0)
})

test("run a .desktop app through the app system", () => {
  let activated = 0
  Shell.AppSystem._apps.set("firefox.desktop", { activate: () => activated++ })
  parseLine("<Super>f,firefox.desktop,firefox,", app).trigger()
  assert.equal(activated, 1)
  assert.equal(Gio.Subprocess.spawned.length, 0)
})

test("run-only never raises", () => {
  display.add(firefox())
  parseLine("<Super>f,firefox", app).trigger()
  assert.equal(Main.activated.length, 0)
  assert.equal(Gio.Subprocess.spawned.length, 1)
})

test("always-run both raises and runs", () => {
  const ff = display.add(firefox())
  parseLine("<Super>f:always-run,firefox,firefox,", app).trigger()
  assert.deepEqual(Main.activated, [ff])
  assert.equal(Gio.Subprocess.spawned.length, 1)
})

test("cycle through conforming windows", () => {
  const ff1 = display.add(firefox())
  const ff2 = display.add(firefox())
  const ff3 = display.add(firefox())
  display.add(terminal(), true) // [terminal, ff1, ff2, ff3]
  const a = parseLine("<Super>f,firefox,firefox,", app)

  // the most recently used conforming window first
  a.trigger()
  assert.equal(display.focused, ff1)
  // then the oldest ones of the group
  a.trigger()
  assert.equal(display.focused, ff3)
  a.trigger()
  assert.equal(display.focused, ff2)
  a.trigger()
  assert.equal(display.focused, ff1)
})

test("focused single window stays focused", () => {
  const ff = display.add(firefox(), true)
  display.add(terminal())
  parseLine("<Super>f,firefox,firefox,", app).trigger()
  assert.equal(display.focused, ff)
  assert.equal(ff.minimized, false)
  assert.equal(Gio.Subprocess.spawned.length, 0)
})

test("minimize-when-unfocused", () => {
  const ff = display.add(firefox(), true)
  parseLine("<Super>f:minimize-when-unfocused,firefox,firefox,", app).trigger()
  assert.equal(ff.minimized, true)
})

test("switch-back-when-focused respects the monitor", () => {
  const t0 = display.add(terminal({ monitor: 0 }))
  const t1 = display.add(terminal({ monitor: 1 }))
  const ff = display.add(firefox({ monitor: 1 }), true) // [ff, t0, t1]

  parseLine("<Super>f:switch-back-when-focused,firefox,firefox,", app).trigger()
  assert.equal(display.focused, t1)

  t0._focus()
  ff._focus() // [ff, t0, t1]
  parseLine(
    "<Super>f:switch-back-when-focused(all_monitors),firefox,firefox,",
    app,
  ).trigger()
  assert.equal(display.focused, t0)
})

test("isolate-workspace ignores windows elsewhere", () => {
  display.add(firefox({ workspace: "ws1" }))
  parseLine("<Super>f:isolate-workspace,firefox,firefox,", app).trigger()
  assert.equal(Main.activated.length, 0)
  assert.equal(Gio.Subprocess.spawned.length, 1)

  // the same through global settings
  reset()
  display.add(firefox({ workspace: "ws1" }))
  parseLine(
    "<Super>f,firefox,firefox,",
    fakeApp(new Settings({ "isolate-workspace": true })),
  ).trigger()
  assert.equal(Main.activated.length, 0)
})

test("move-window-to-active-workspace", () => {
  const ff = display.add(firefox({ workspace: "ws1" }))
  parseLine(
    "<Super>f:move-window-to-active-workspace,firefox,firefox,",
    app,
  ).trigger()
  assert.equal(ff.workspace, "ws0")
  assert.equal(display.focused, ff)
})

test("center-mouse-to-focused-window warps only when the pointer is outside", () => {
  display.add(firefox())
  const a = parseLine(
    "<Super>f:center-mouse-to-focused-window,firefox,firefox,",
    app,
  )
  a.trigger()
  assert.deepEqual(app.seat.warped, [[200, 150]])

  global.get_pointer = () => [150, 120] // inside the frame rect
  display.add(terminal(), true)
  a.trigger()
  assert.equal(app.seat.warped.length, 1)
})

test("register and raise", () => {
  const ff = display.add(firefox(), true)
  const t = display.add(terminal())
  parseLine("<Super>1:register(1),x,,", app).trigger()
  assert.equal(app.register[1], ff)

  t._focus()
  parseLine("<Super>2:raise(1),x,,", app).trigger()
  assert.equal(display.focused, ff)

  // registered window closed
  display.windows = display.windows.filter(w => w !== ff)
  t._focus()
  Main.activated.length = 0
  parseLine("<Super>2:raise(1),x,,", app).trigger()
  assert.equal(Main.activated.length, 0)
})

test("raise-or-register", () => {
  const ff = display.add(firefox(), true)
  const t = display.add(terminal())
  const a = parseLine("<Super>1:raise-or-register,x,,", app)

  a.trigger() // registers the current window
  assert.equal(app.register[a], ff)

  t._focus()
  a.trigger() // raises it
  assert.equal(display.focused, ff)

  // another action has its own register
  const b = parseLine("<Super>2:raise-or-register,x,,", app)
  b.trigger()
  assert.equal(app.register[b], ff)
})

test("verbose mode notifies", () => {
  display.add(firefox())
  parseLine("<Super>f:verbose,firefox,firefox,", app).trigger()
  assert.ok(Main.notifications.length > 0)

  Main.notifications.length = 0
  parseLine("<Super>f,firefox,firefox,", app).trigger()
  assert.equal(Main.notifications.length, 0)
})
