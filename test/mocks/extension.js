// Stand-in for resource:///org/gnome/shell/extensions/extension.js
import { Settings } from "./shell.js"

export class Extension {
  constructor(metadata) {
    this.metadata = metadata
    this.settings = new Settings()
  }

  getSettings() {
    return this.settings
  }
}
