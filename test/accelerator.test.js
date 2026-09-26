import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { reset, fakeApp } from "./mocks/shell.js"
import { Gio } from "./mocks/gi.js"
import * as Main from "./mocks/main.js"
import { parseLine } from "../lib/action.js"
import { Accelerator } from "../lib/accelerator.js"
import { arraysEqual, DefaultMap } from "../lib/static.js"

let app, display, state
beforeEach(() => {
  display = reset()
  state = [false, false, false]
  app = {
    ...fakeApp(),
    accelerator_map: new Map(),
    get_state: () => state,
  }
})

function accelerator(...lines) {
  const actions = lines.map(line => parseLine(line, app))
  const acc = new Accelerator(actions[0].shortcut, app)
  acc.push(...actions)
  return acc
}

test("connect and disconnect", () => {
  const acc = accelerator("<Super>f,firefox,,")
  acc.connect()
  assert.deepEqual([...display.grabbed.values()], ["<Super>f"])
  assert.equal(app.accelerator_map.get(acc.action_id), acc)
  assert.equal(Main.wm.allowed.get(acc.name), 1)

  const name = acc.name
  acc.disconnect()
  assert.equal(display.grabbed.size, 0)
  assert.equal(app.accelerator_map.size, 0)
  assert.equal(Main.wm.allowed.get(name), 0)
  acc.disconnect() // no-op
})

test("trigger runs the actions conforming the keyboard state, returns the layered ones", () => {
  const acc = accelerator(
    "<Super>i,a",
    "<Num_Lock><Super>i,b",
    "<Num_Lock_OFF><Super>i,c",
    "<Super>i x,d",
  )
  const layered = acc.trigger()
  assert.deepEqual(Gio.Subprocess.spawned, [["a"], ["c"]])
  assert.deepEqual(
    Array.from(layered, a => a.command),
    ["d"],
  )

  state = [true, false, false]
  Gio.Subprocess.spawned.length = 0
  acc.trigger()
  assert.deepEqual(Gio.Subprocess.spawned, [["a"], ["b"]])
})

test("failing action is reported, the others still run", () => {
  const acc = accelerator("<Super>i,a", "<Super>i,b")
  acc[0].trigger = () => {
    throw new Error("boom")
  }
  acc.trigger()
  assert.deepEqual(Gio.Subprocess.spawned, [["b"]])
  assert.ok(Main.notifications.some(([, text]) => text.includes("boom")))
})

test("lock-dependent accelerator follows the keyboard state", () => {
  const acc = accelerator("<Num_Lock><Super>i,a")
  acc.on_state_changed([])
  assert.equal(acc.action_id, null)

  state = [true, false, false]
  acc.on_state_changed([false, false, false])
  assert.notEqual(acc.action_id, null)

  state = [false, false, false]
  acc.on_state_changed([true, false, false])
  assert.equal(acc.action_id, null)
  assert.equal(display.grabbed.size, 0)
})

test("blocked accelerator reconnects only after unblock, and only if it was connected", () => {
  const acc = accelerator("<Super>f,firefox,,")
  acc.connect()
  acc.block()
  assert.equal(display.grabbed.size, 0)
  assert.equal(acc.connect(), false)
  assert.equal(display.grabbed.size, 0)
  acc.unblock()
  assert.equal(display.grabbed.size, 1)

  const idle = accelerator("<Super>g,gedit,,")
  idle.block().unblock()
  assert.equal(idle.action_id, null)
})

test("DefaultMap", () => {
  const m = new DefaultMap(key => [key])
  assert.equal(m.has("a"), false)
  const a = m.get("a")
  assert.deepEqual(a, ["a"])
  assert.equal(m.get("a"), a)
  assert.equal(m.size, 1)
})

test("arraysEqual", () => {
  assert.ok(arraysEqual([], []))
  assert.ok(arraysEqual([1, null, true], [1, null, true]))
  assert.ok(!arraysEqual([1], [1, 2]))
  assert.ok(!arraysEqual([null], [false]))
})
