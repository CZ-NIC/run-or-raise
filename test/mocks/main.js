// Stand-in for resource:///org/gnome/shell/ui/main.js

export const activated = []
export const notifications = []

export function activateWindow(window) {
  if (!window.get_workspace()) {
    throw new Error("window.get_workspace() is null")
  }
  activated.push(window)
  window._focus()
}

export function notify(title, text) {
  notifications.push([title, text])
}

export const wm = {
  allowed: new Map(), // binding name → action mode
  allowKeybinding(name, mode) {
    this.allowed.set(name, mode)
  },
}

export const layoutManager = {
  chrome: [],
  addChrome(actor) {
    this.chrome.push(actor)
  },
}
