const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const {spawnCommandLine, spawn} = imports.misc.util;
const Convenience = Me.imports.convenience;
const Gdk = imports.gi.Gdk

// XX it seems the following function is deprecated.
// However, it works both in GNOME v3.36.8 on Wayland (#31) and in 3.38.2 on X11
// Get rid in the future.
const Keymap = Gdk.Keymap.get_default()
// const Keymap = Gdk.Keymap.get_for_display(Gdk.Display.get_default()) # works in 3.38.2 on X11


let app, conf_path, default_conf_path, settings

function log() {
    global.log.apply(null, arguments);
}

/**
 * Helper class (simulating Python collections.defaultdict)
 */
class DefaultMap extends Map {
    get(key) {
        if (!this.has(key)) {
            super.set(key, this.default(key))
        }
        return super.get(key);
    }

    constructor(defaultFunction, entries) {
        super(entries);
        this.default = defaultFunction;
    }
}

function arraysEqual(arr1, arr2) {
    if (arr1.length != arr2.length) {
        return false
    }
    for (let i = arr1.length; i--;) {
        if (arr1[i] !== arr2[i])
            return false
    }
    return true
}

/**
 * @type {Action[]} Actions in the array have the same shortcut accelerator
 */
class Accelerator extends Array {

    /**
     * @type {Map}
     */
    // static grabbers XX Uncomment when Ubuntu 20.04 Gnome-shell 3.36 dropped.

    constructor(shortcut) {
        super()
        /**
         * ID of the grabber accelerator action.
         * We may use this ID to ungrab the accelerator.
         * All action in this ActionGroup have it in common
         * @type {int?}
         */
        this.action_id = null
        this.name = null
        this.shortcut = shortcut
    }

    on_state_changed(state, last_state) {
        let conforms = this.some(action => action.state_conforms(state))

        if (this.action_id !== null && !conforms) { // the shortcut must no more be consumed
            this.disconnect()
        } else if (this.action_id === null && conforms) { // enable new state shortcuts
            this.connect(state)
        } else if (this.action_id !== null && conforms
            && !arraysEqual(this.filter_actions(state), this.filter_actions(last_state))) {
            // re-do the set of the actions performed on accelerator trigger
            // ex: Num_Lock state change while having both `<Num_Lock_OFF>i` and `<Num_Lock>i` defined
            this.disconnect()
            this.connect(state)
        }
    }

    filter_actions(state) {
        return this.filter(action => action.state_conforms(state))
    }

    /**
     * Grab the accelerator, start listening.
     * @param state Only actions conforming the system keyboard-lock state will be registered
     */
    connect(state) {
        let action = global.display.grab_accelerator(this.shortcut, 0)
        if (action === Meta.KeyBindingAction.NONE) {
            log('Unable to grab accelerator', this.shortcut)
            return false
        }
        // Grabbed accelerator action, receive its binding name
        this.action_id = action
        this.name = Meta.external_binding_name_for_action(action)

        // Requesting WM to allow binding name
        Main.wm.allowKeybinding(this.name, Shell.ActionMode.ALL)

        Accelerator.grabbers.set(action, () => this.filter_actions(state).forEach(action => action.trigger())
        )
        // log('Successfully set', accelerator, name, action)
    }

    disconnect() {
        if (this.action_id === null) {
            return
        }
        try {
            global.display.ungrab_accelerator(this.action_id)
            Main.wm.allowKeybinding(this.name, Shell.ActionMode.NONE)
            this.action_id = null
        } catch (e) {
            log("Run or raise: error removing keybinding " + this.name)
            log(e)
        }
    }
}

/**
 * Allow user to cast a specific instruction
 */
class Mode {

    /**
     * @param values Ex: [["cmd", true], ["launch": 2]]
     */
    constructor(values) {
        this.values = []
        values.forEach(key_val => this.add(key_val[0], key_val[1]))
    }

    /**
     * @param key
     * @return Current key value if contained in the current object or true if such key is on in the global settings
     */
    get(key) {
        try {
            return this.values[key] || settings.get_boolean(key)
        } catch (e) { // key does not exist in the global settings
            return false
        }
    }

    /**
     * Adds new keyword
     * @param key
     * @param val
     */
    add(key, val) {
        if (!Object.values(Mode).includes(key)) {
            throw `Unknown mode: ${key}`;
        }
        this.values[key] = val
    }
}

/**
 * Assign static keywords to the object Mode.
 * The value should be the same as the one in gschema.xml as we can compare globals and shorcuts.conf keywords at once
 */
Object.assign(Mode, Object.freeze({
    "ALWAYS_RUN": "always-run", // both runs the command and raises a window
    "RUN_ONLY": "run-only", // just runs the command without cycling windows
    "ISOLATE_WORKSPACE": "isolate-workspace", // Switch windows on the active workspace only
    "MINIMIZE_WHEN_UNFOCUSED": "minimize-when-unfocused",
    "SWITCH_BACK_WHEN_FOCUSED": "switch-back-when-focused",
    "MOVE_WINDOW_TO_ACTIVE_WORKSPACE": "move-window-to-active-workspace",
    "CENTER_MOUSE_TO_FOCUSED_WINDOW": "center-mouse-to-focused-window",
    "REGISTER": "register", // register current window to be re-raised by Mode.RAISE
    "RAISE": "raise", // raise the windows previously registered by Mode.REGISTER
    "RAISE_OR_REGISTER": "raise-or-register", // if nothing registered yet, register current
    "VERBOSE": "verbose"
}))

/**
 * Registered windows to be raised
 * @type {{}}
 */
const register = []

class Action {

    /**
     * Single shortcut binding representation
     * @param command
     * @param wm_class
     * @param title
     * @param {Mode} mode
     * @return function
     */
    constructor(command = "", wm_class = "", title = "", mode = null) {
        this.command = command
        this.wm_class = wm_class || ""  // may be undefined when user does not set enough parameters
        this.title = title || ""  // may be undefined when user does not set enough parameters
        this.mode = mode
        this.wmFn = null
        this.titleFn = null;
        [this.wm_class, this.wmFn] = this._allow_regex(wm_class);
        [this.title, this.titleFn] = this._allow_regex(title);

        /**
         * Is the actions depend on the keyboard-lock state
         * @type {boolean?>}
         */
        this.num_lock = this.caps_lock = this.scroll_lock = null;

        /**
         * Set by this.set_shortcut
         * @type {String}
         */
        this.shortcut = null;

        /**
         * Shortcuts remembers the windows it is bind to
         * @type {window}
         */
        this.registered_window = null;
    }

    /**
     * Return appropriate method for s, depending if s is a regex (search) or a string (indexOf)
     * @param s
     * @return {(string|string)[]|(RegExp|string)[]} Tuple
     * @private
     */
    _allow_regex(s) {
        if (s.substr(0, 1) === "/" && s.slice(-1) === "/") {
            // s is surround with slashes, ex: `/my-program/`, we want to do a regular match when searching
            return [new RegExp(s.substr(1, s.length - 2)), "search"]
        } else {  // s is a classic string (even empty), we just do indexOf match
            return [s, "indexOf"]
        }
    }

    debug() {
        if (!this.mode.get(Mode.VERBOSE)) {
            return
        }
        let s = "Run-or-raise>"
        for (let a of arguments) {
            s += " " + a
        }
        log(s)
        spawn(["notify-send", s]); // not very reliable and not the whole text visible
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
        let [command, wm_class, wmFn, title, titleFn] = [this.command, this.wm_class, this.wmFn, this.title, this.titleFn];

        const window_class = window.get_wm_class() || '';
        const window_title = window.get_title() || '';
        // check if the current window is conforming to the search criteria
        if (wm_class) { // seek by class wm_class AND if set, title must match
            if (window_class[wmFn](wm_class) > -1 && (!title || window_title[titleFn](title) > -1)) {
                return true;
            }
        } else if ((title && window_title[titleFn](title) > -1) || // seek by title
            (!title && ((window_class.toLowerCase().indexOf(command.toLowerCase()) > -1) || // seek by launch-command in wm_class
                (window_title.toLowerCase().indexOf(command.toLowerCase()) > -1))) // seek by launch-command in title
        ) {
            return true;
        }
        return false;
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
            // XX #31 may not work in GNOME v3.36.8 on Wayland but nobody reported it
            const pointer = Gdk.Display.get_default().get_default_seat().get_pointer()
            const screen = pointer.get_position()[0]
            const center = window.get_center()
            pointer.warp(screen, center.x, center.y)
        }
        this.debug("Window activated")
        return true
    }

    /**
     * Trigger the shortcut (system does it)
     * @return {boolean|*}
     */
    trigger() {
        let mode = this.mode;

        // Debug info
        this.debug(`trigger title: ${this.title}, titleFn: ${this.titleFn}, wm_class: ${this.wm_class}, wmFn: ${this.wmFn}`);

        // Check raising keywords
        let i
        if ((i = mode.get(Mode.RAISE_OR_REGISTER))) {
            if (!this.registered_window || !this.focus_window(this.registered_window, true)) {
                this.registered_window = this.get_windows()[0]
            }
            return
        }
        if ((i = mode.get(Mode.REGISTER))) {
            return register[i] = this.get_windows()[0]  // will stay undefined if there is no such window
        }
        if ((i = mode.get(Mode.RAISE))) {
            return this.focus_window(register[i], true)
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
        return spawnCommandLine(this.command);
    }

    /**
     * Parse non-standard modifiers
     * @param shortcut
     * @return {*} Return the shortcut with the non-standard modifiers removed
     */
    set_shortcut(shortcut) {

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

        return this.shortcut = shortcut.trim()
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
     * @param state_system Array of true/false
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

/**
 * Main controller to de/register shortcuts
 */
class Controller {

    enable() {
        /* XX Note Ubuntu 20.10: Using modifiers <Mod3> – <Mod5> worked good for me, <Mod2> (xmodmap shows a numlock)
        consumed the shortcut when Num_Lock (nothing printed out) but it seems nothing was triggered here.

        Keymap.get_modifier_state() returns an int 2^x where x is 8 positions of xmodmap*/
        let s;
        try {
            s = Shell.get_file_contents_utf8_sync(conf_path);
        } catch (e) {
            log(`Run or raise: cannot load confpath ${conf_path}, creating new file from default`);
            spawnCommandLine("mkdir -p " + conf_path.substr(0, conf_path.lastIndexOf("/")));
            spawnCommandLine("cp " + default_conf_path + " " + conf_path);
            try {
                s = Shell.get_file_contents_utf8_sync(default_conf_path); // it seems confpath file is not ready yet, reading defaultconfpath
            } catch (e) {
                log("Run or raise: Failed to create the default file")
                return;
            }
        }
        let shortcuts = s.split("\n")
        Accelerator.grabbers = new Map()

        // Catch the signal that one of system-defined accelerators has been triggered
        this.handler_accelerator_activated = global.display.connect(
            'accelerator-activated',
            (display, action, deviceId, timestamp) => {
                try {
                    Accelerator.grabbers.get(action)()
                } catch (e) {
                    log('Run-or-raise> No listeners [action={}]', action)
                }
            }
        )

        /**
         *
         * @type {DefaultMap} {shortcut => [action, ...]}
         */
        const accelerators = new DefaultMap((shortcut) => new Accelerator(shortcut))
        this.accelerators = accelerators

        // parse shortcut file
        for (let line of shortcuts) {
            try {
                if (line[0] === "#" || line.trim() === "") {  // skip empty lines and comments
                    continue;
                }

                // Optional argument quoting in the format: `shortcut[:mode][:mode],[command],[wm_class],[title]`
                // ', b, c, "d, e,\" " f", g, h' -> ["", "b", "c", "d, e,\" \" f", "g", "h"]
                let args = line.split(/,(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/)
                    .map(s => s.trim())
                    .map(s => (s[0] === '"' && s.slice(-1) === '"') ? s.slice(1, -1).trim() : s) // remove quotes
                let [shortcut_mode, command, wm_class, title] = args;

                // Split shortcut[:mode][:mode] -> shortcut, mode
                let [shortcut_raw, ...modes] = shortcut_mode.split(":")
                // Store to "shortcut:cmd:launch(2)" → new Mode([["cmd", true], ["launch": 2]])
                // XX Use this statement since Gnome shell 3.38 (named groups do not work in 3.36 yet)
                let mode = new Mode(modes
                //     .map(m => m.match(/(?<key>[^(]*)(\((?<arg>.*?)\))?/)) // "launch" -> key=launch, arg=undefined
                //     .filter(m => m) // "launch" must be a valid mode string
                //     .map(m => [m.groups.key, m.groups.arg || true])  // ["launch", true]
                    .map(m => m.match(/([^(]*)(\((.*?)\))?/)) // "launch" -> key=launch, arg=undefined
                    .filter(m => m) // "launch" must be a valid mode string
                    .map(m => [m[1], m[3] || true])  // ["launch", true]
                )
                if (args.length <= 2) { // Run only mode, we never try to raise a window
                    mode.add(Mode.RUN_ONLY, true)
                }
                let action = new Action(command, wm_class, title, mode)
                action.set_shortcut(shortcut_raw)

                accelerators.get(action.shortcut).push(action)
            } catch (e) {
                log("Run or raise: cannot parse line: " + line, e)
            }
        }

        // XX Note: If I register both Hyper and Super (both on the same mod4), the first listener makes it impossible
        // for the second to register. I may distinguish that they are on the same mode and to put them
        // on the same index in `actions`.
        // XX I may manually distinguish Super_L and Super_R if I get the key that was just hit.

        /**
         * Subset of accelerators that includes only lock-dependent actions. (No action requires to be on always.)
         * These should be disabled if the keyboard is in a different state to not consume the shortcut.
         * Ex: Release <Num_Lock_OFF><Super>i when Num_Lock is on
         *  otherwise `<Super>i` would be consumed by the extension.
         *  (However, if generic <Super>i exists, the grabber must stay.)
         */
        const lock_dependent_accelerators = []
        accelerators.forEach((actions, shortcut) => {
                // Launch only generic shortcuts (not lock-dependent) (group having no no-lock shortcuts amongst)
                if (actions.some(action => action.get_state().every(lock => lock === null))) { // these are always on
                    actions.connect(this.get_state())
                } else { // these are lock-dependent, on only if keyboard-locks match
                    lock_dependent_accelerators.push(actions)
                }
            }
        )

        // De/register accelerators depending on the keyboard state
        let last_state = []
        const on_state_changed = () => {
            const state = this.get_state()
            if (!arraysEqual(state, last_state)) {
                lock_dependent_accelerators.forEach(g => g.on_state_changed(state, last_state))
                last_state = state
            }
        };

        this.handler_state_changed = Keymap.connect('state-changed', on_state_changed);
        on_state_changed()
    }


    disable() {
        this.accelerators.forEach(actions => actions.disconnect())  // ungrab the accelerators
        global.display.disconnect(this.handler_accelerator_activated) // stop listening to the accelerators, none left
        Keymap.disconnect(this.handler_state_changed)  // stop listening to keyboard-locks changes
    }

    get_state() {
        return [Keymap.get_num_lock_state(), Keymap.get_caps_lock_state(), Keymap.get_scroll_lock_state()]
    }
}

// Classes launched by gnome-shell

function init(options) {
    conf_path = ".config/run-or-raise/shortcuts.conf"; // CWD seems to be HOME
    default_conf_path = options.path + "/shortcuts.default";
    app = new Controller();
    settings = Convenience.getSettings();
}

function enable(settings) {
    app.enable();
}

function disable() {
    app.disable();
}
