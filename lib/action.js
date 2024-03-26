import Shell from 'gi://Shell'
import { Mode } from './mode.js'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import Mtk from 'gi://Mtk'

class Action {

    /**
     * Single shortcut binding representation
     * @param {Controller} app
     * @param {String} command
     * @param {?String|RegExp} wm_class // may be undefined when user does not set enough parameters
     * @param {?String|RegExp} title // may be undefined when user does not set enough parameters
     * @param {Mode} mode
     * @param {String} shortcut_bare
     * @param {String[]} layers
     */
    constructor(app, shortcut_bare, layers, mode, command = "", wm_class = "", title = "") {
        this.app = app
        this.command = command
        this.wm_class = wm_class
        this.title = title
        this.mode = mode
        this.wmFn = null
        this.titleFn = null; // ; needed
        [this.wm_class, this.wmFn] = this._allow_regex(this.wm_class); // ; needed
        [this.title, this.titleFn] = this._allow_regex(this.title)
        /**
         * @type {String[]} `<Super>g a b,command` → ["a", "b"]
         */
        this.layers = layers || []

        /**
         * Is the actions depend on the keyboard-lock state
         * @type {?boolean}
         */
        this.num_lock = this.caps_lock = this.scroll_lock = null

        /**
         * @type {String}
         */
        this.shortcut = this._set_shortcut(shortcut_bare)
    }

    get_layered_action() {
        const shortcut = this.layers[0]
        const new_layers = this.layers.slice(1, this.layers.length)
        return new Action(this.app, shortcut, new_layers, this.mode, this.command, this.wm_class, this.title)
    }

    /**
     * Return appropriate method for s, depending if s is a regex (search) or a string (indexOf)
     * @param {RegExp|string} s
     * @return {[RegExp|string, string]} Tuple
     * @private
     */
    _allow_regex(s) {
        if(s instanceof RegExp) {
            return [s, "search"]
        } else if (s.startsWith("/") && s.endsWith("/")) {
            // s is surround with slashes, ex: `/my-program/`, we want to do a regular match when searching
            return [new RegExp(s.substring(1, s.length - 1)), "search"]
        } else {  // s is a classic string (even empty), we just do indexOf match
            return [s, "indexOf"]
        }
    }

    debug() {
        if (!this.mode.get(Mode.VERBOSE)) {
            return
        }
        let s = ""
        for (let a of arguments) {
            s += " " + a
        }
        this.app.display(s)
    }


    /**
     * @return {*} Current windows
     */
    get_windows() {
        // Switch windows on active workspace only
        const workspace_manager = global.display.get_workspace_manager()
        const active_workspace = this.mode.get(Mode.ISOLATE_WORKSPACE) ? workspace_manager.get_active_workspace() : null

        // fetch windows
        return global.display.get_tab_list(0, active_workspace)
    }


    is_conforming(window) {
        const [command, wmNeedle, wmFn, title, titleFn] = [this.command, this.wm_class, this.wmFn, this.title, this.titleFn]

        const window_name = window.get_wm_class() || ''
        const window_instance = window.get_wm_class_instance() || ''
        const window_title = window.get_title() || ''

        // check if the current window is conforming to the search criteria
        if (wmNeedle) { // seek by (wm_class_name or wm_class_instance) AND if set, title must match
            if (
                (window_instance[wmFn](wmNeedle) > -1 ||
                    window_name[wmFn](wmNeedle) > -1)
                && (!title || window_title[titleFn](title) > -1)) {
                return true
            }
        } else if ((title && window_title[titleFn](title) > -1) || // seek by title
            (!title && ((window_name.toLowerCase().indexOf(command.toLowerCase()) > -1) || // seek by launch-command in wm_class_name only (I do not see a use-case where command might match wm_class_instance)
                (window_title.toLowerCase().indexOf(command.toLowerCase()) > -1))) // seek by launch-command in title
        ) {
            return true
        }
        return false
    }

    /**
     *
     * @param window
     * @param check if true, we focus only if the window is listed amongst current windows
     * @return {boolean}
     */
    focus_window(window, check = false) {
        if (check
            && (!window  // gnome shell reloaded and window IDs changed (even if window might be still there)
                || !this.get_windows().filter(w => w.get_id() == window.get_id()).length // window closed
            )) {
            this.debug("Window not found")
            return false
        }

        if (this.mode.get(Mode.MOVE_WINDOW_TO_ACTIVE_WORKSPACE)) {
            const activeWorkspace = global.workspaceManager.get_active_workspace();
            window.change_workspace(activeWorkspace);
        }
        window.get_workspace().activate_with_focus(window, true)
        window.activate(0)
        if (this.mode.get(Mode.CENTER_MOUSE_TO_FOCUSED_WINDOW)) {
            const win_rect = window.get_frame_rect()
            const [x, y] = global.get_pointer()
            const pointer_rect = new Mtk.Rectangle({ x, y, width: 1, height: 1 })
            if (!pointer_rect.intersect(win_rect)[0]) {
                const { x, y, width, height } = win_rect
                this.app.seat.warp_pointer(x + width / 2, y + height / 2)
            }
        }
        this.debug("Window activated")
        return true
    }

    /**
     * Trigger the shortcut (system does it)
     * @return {boolean|*}
     */
    trigger() {
        let mode = this.mode

        // Debug info
        this.debug(`trigger title: ${this.title}, titleFn: ${this.titleFn}, wm_class: ${this.wm_class}, wmFn: ${this.wmFn}`);

        // Check raising keywords
        let i
        if ((i = mode.get(Mode.RAISE_OR_REGISTER))) {
            if (i === true) {
                // Shortcuts remembers the windows it is bind to, does not need global extension register
                // `:raise-or-register` used, not `:raise-or-register(int)`
                i = this
            }
            if (!this.app.register[i] || !this.focus_window(this.app.register[i], true)) {
                this.app.register[i] = this.get_windows()[0]
            }
            return
        }
        if ((i = mode.get(Mode.REGISTER))) {
            return this.app.register[i] = this.get_windows()[0]  // will stay undefined if there is no such window
        }
        if ((i = mode.get(Mode.RAISE))) {
            return this.focus_window(this.app.register[i], true)
        }

        // Check if the shortcut should just run without raising a window
        if (mode.get(Mode.RUN_ONLY)) {
            return this.run()
        }

        /**
         * @type {window}
         */
        let seen = null;
        const windows = this.get_windows()
        // if window conforms, let's focus the oldest windows of the group
        // (otherwise we find the youngest conforming one)
        const ordered = (windows.length && this.is_conforming(windows[0])) ?
            windows.slice(0).reverse() : windows
        let window
        for (window of ordered) {
            if (this.is_conforming(window)) {
                seen = window;
                if (!seen.has_focus()) {
                    break; // there might exist another window having the same parameters
                }
            }
        }
        if (seen) {
            if (!seen.has_focus()) {
                this.focus_window(seen);
            } else {
                if (mode.get(Mode.MINIMIZE_WHEN_UNFOCUSED)) {
                    seen.minimize();
                }
                if (mode.get(Mode.SWITCH_BACK_WHEN_FOCUSED)) {
                    const window_monitor = window.get_monitor();
                    const window_list = windows.filter(w => w.get_monitor() === window_monitor && w !== window)
                    const last_window = window_list[0];
                    if (last_window) {
                        this.focus_window(last_window);
                    }
                }
            }
        }
        if (!seen || mode.get(Mode.ALWAYS_RUN)) {
            this.run();
        }
    }

    run() {
        if (this.mode.get(Mode.VERBOSE)) {
            this.debug("running:", this.command)
        }
        const app = Shell.AppSystem.get_default().lookup_app(this.command)
        if (app !== null) {
            return app.activate()
        }
        const [, argv] = GLib.shell_parse_argv(this.command)
        return Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE)
    }

    /**
     * Parse non-standard modifiers
     * @param shortcut
     * @return {*} Return the shortcut with the non-standard modifiers removed
     */
    _set_shortcut(shortcut) {

        const included = (sym) => {
            if (shortcut.includes(`<${sym}>`)) {
                shortcut = shortcut.replace(`<${sym}>`, "")
                return true
            }
            if (shortcut.includes(`<${sym}_OFF>`)) {
                shortcut = shortcut.replace(`<${sym}_OFF>`, "")
                return false
            }
            return null
        }

        this.num_lock = included("Num_Lock")
        this.caps_lock = included("Caps_Lock")
        this.scroll_lock = included("Scroll_Lock")

        return shortcut.trim()
    }

    /**
     *
     * @return {*[]} Array of true/false/null
     */
    get_state() {
        return [this.num_lock, this.caps_lock, this.scroll_lock]
    }


    /**
     * Is the shortcut valid in the current keyboard state?
     * @param {State} state_system Array of true/false
     * @return {boolean} True if all boolean values matches whereas null values in this.get_state() are ignored.
     */
    state_conforms(state_system) {
        const state_action = this.get_state()
        for (let i = 0; i < state_action.length; i++) {
            if (state_action[i] === null) {
                continue
            }
            if (state_action[i] !== state_system[i]) {
                return false
            }
        }
        return true
    }

}

export function parseLine(line, app) {
    // Optional argument quoting in the format: `shortcut[:mode][:mode],[command],[wm_class],[title]`
    // ', b, c, "d, e,\" " f", g, h' -> ["", "b", "c", "d, e,\" \" f", "g", "h"]
    const args = line.split(/,(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/)
        .map(s => s.trim())
        .map(s => (s[0] === '"' && s.slice(-1) === '"') ? s.slice(1, -1).trim() : s) // remove quotes
    const [shortcut_layer_mode, command, wm_class, title] = args

    // Split shortcut[:mode][:mode] -> shortcut, mode
    const [shortcut_layer, ...modes] = shortcut_layer_mode.split(":")
    const [shortcut_bare, ...layers] = shortcut_layer.split(" ")
    // Store to "shortcut:cmd:launch(2)" → new Mode([["cmd", true], ["launch": 2]])
    const mode = new Mode(modes
        .map(m => m.match(/(?<key>[^(]*)(\((?<arg>.*?)\))?/)) // "launch" -> key=launch, arg=undefined
        .filter(m => m) // "launch" must be a valid mode string
        .map(m => [m.groups.key, m.groups.arg || true])  // ["launch", true]
        , app.settings
    )
    if (args.length <= 2) { // Run only mode, we never try to raise a window
        mode.add(Mode.RUN_ONLY, true)
    }
    return new Action(app, shortcut_bare, layers, mode, command, wm_class, title)
}
