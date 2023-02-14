const Main = imports.ui.main;
const { Meta, Shell, St, Gdk, Gio, Clutter } = imports.gi
const ExtensionUtils = imports.misc.extensionUtils
const { spawnCommandLine } = imports.misc.util
const ModalDialog = imports.ui.modalDialog.ModalDialog
const Dialog = imports.ui.dialog.Dialog

const PopupMenu = imports.ui.popupMenu;

let seat, pointer, keymap, conf_path, default_conf_path, settings
/**
 * @type {Controller}
 */
let app

function display(text) {
    Main.notify("Run-or-raise", text)
}

/**
 * @typedef {boolean[]} State Array of true/false
 */


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
 *  @typedef {Action[]} Accelerator Actions in the array have the same shortcut accelerator.
 *  XX do not know how to document the values of a class extending array properly
 */
class Accelerator extends Array {

    /**
     * @type {Map}
     */
    static grabbers

    constructor(shortcut) {
        super()
        /**
         * ID of the grabber accelerator action.
         * We may use this ID to ungrab the accelerator.
         * All actions in this Accelerator have it in common
         * @type {?number}
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

    /**
     *
     * @param {State} state
     * @returns {Action[]}
     */
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
            display(`Unable to grab accelerator: ${this.shortcut}`)
            return false
        }
        // Grabbed accelerator action, receive its binding name
        this.action_id = action
        this.name = Meta.external_binding_name_for_action(action)

        // Requesting WM to allow binding name
        Main.wm.allowKeybinding(this.name, Shell.ActionMode.ALL)

        Accelerator.grabbers.set(action, () => app.layered_shortcut(this.filter_actions(state).filter(action => {
            try {
                if (action.layers.length) {
                    return action
                }
                action.trigger()
            } catch (e) {
                display(`${this.shortcut} ${e}`)
            }
        })))
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
            display(`Error removing keybinding ${this.name}: ${e}`)
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
     * @param {String} command
     * @param {String} wm_class
     * @param {String} title
     * @param {Mode} mode
     * @param {String} shortcut_bare
     * @param {String[]} layers
     */
    constructor(command = "", wm_class = "", title = "", mode = null, shortcut_bare = "", layers = []) {
        this.command = command
        this.wm_class = wm_class || ""  // may be undefined when user does not set enough parameters
        this.title = title || ""  // may be undefined when user does not set enough parameters
        this.mode = mode
        this.wmFn = null
        this.titleFn = null;
        [this.wm_class, this.wmFn] = this._allow_regex(wm_class);
        [this.title, this.titleFn] = this._allow_regex(title);
        /**
         * @type {String[]} `<Super>g a b,command` → ["a", "b"]
         */
        this.layers = layers || []

        /**
         * Is the actions depend on the keyboard-lock state
         * @type {?boolean}
         */
        this.num_lock = this.caps_lock = this.scroll_lock = null;

        /**
         * @type {String}
         */
        this.shortcut = this._set_shortcut(shortcut_bare)

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
        Main.notify(s)
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
            const { x, y, width, height } = window.get_frame_rect()
            seat.warp_pointer(x + width / 2, y + height / 2)
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
        const app = Shell.AppSystem.get_default().lookup_app(this.command);
        if (app !== null) {
            return app.activate();
        }
        return spawnCommandLine(this.command);
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

    static parseLine(line) {
        // Optional argument quoting in the format: `shortcut[:mode][:mode],[command],[wm_class],[title]`
        // ', b, c, "d, e,\" " f", g, h' -> ["", "b", "c", "d, e,\" \" f", "g", "h"]
        const args = line.split(/,(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/)
            .map(s => s.trim())
            .map(s => (s[0] === '"' && s.slice(-1) === '"') ? s.slice(1, -1).trim() : s) // remove quotes
        const [shortcut_layer_mode, command, wm_class, title] = args

        global.log("raise4")
        // Split shortcut[:mode][:mode] -> shortcut, mode
        const [shortcut_layer, ...modes] = shortcut_layer_mode.split(":")
        const [shortcut_bare, ...layers] = shortcut_layer.split(" ")
        // Store to "shortcut:cmd:launch(2)" → new Mode([["cmd", true], ["launch": 2]])
        // XX Use this statement since Gnome shell 3.38 (named groups do not work in 3.36 yet)
        const mode = new Mode(modes
            //     .map(m => m.match(/(?<key>[^(]*)(\((?<arg>.*?)\))?/)) // "launch" -> key=launch, arg=undefined
            //     .filter(m => m) // "launch" must be a valid mode string
            //     .map(m => [m.groups.key, m.groups.arg || true])  // ["launch", true]
            .map(m => m.match(/([^(]*)(\((.*?)\))?/)) // "launch" -> key=launch, arg=undefined
            .filter(m => m) // "launch" must be a valid mode string
            .map(m => [m[1], m[3] || true]) // ["launch", true]
        )
        if (args.length <= 2) { // Run only mode, we never try to raise a window
            mode.add(Mode.RUN_ONLY, true)
        }
        return new Action(command, wm_class, title, mode, shortcut_bare, layers)
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
        const shortcuts = this._fetch_shortcuts()
        if (!shortcuts) {
            return
        }
        Accelerator.grabbers = new Map()

        // Catch the signal that one of system-defined accelerators has been triggered
        this.handler_accelerator_activated = global.display.connect(
            'accelerator-activated',
            (display_, action, deviceId, timestamp) => Accelerator.grabbers.get(action)() // ex: Fn+volume_up raises TypeError not a function
        )

        /**
         *
         * @type {DefaultMap<String,Accelerator>} {shortcut => [action, ...]}
         */
        const accelerators = new DefaultMap((shortcut) => new Accelerator(shortcut))
        this.accelerators = accelerators

        // parse shortcut file
        for (const line of shortcuts) {
            try {
                if (line[0] === "#" || line.trim() === "") {  // skip empty lines and comments
                    continue
                }
                const action = Action.parseLine(line)
                accelerators.get(action.shortcut).push(action)
            } catch (e) {
                display(`Cannot parse line: ${line}. ${e}`)
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

        this.handler_state_changed = keymap.connect('state-changed', on_state_changed);
        on_state_changed()

        this.handler_keypress = null
    }

    _fetch_shortcuts() {
        let s;
        try {
            s = Shell.get_file_contents_utf8_sync(conf_path);
        } catch (e) {
            display(`Cannot load confpath ${conf_path}, creating new file from default`)
            // instead of using `mkdir -p` and `cp`,
            // the GNOME team required me to use this dark and cumbersome methods to copy a single file
            const target_dir = Gio.File.new_for_path(conf_path.substr(0, conf_path.lastIndexOf("/")))
            const target = Gio.File.new_for_path(conf_path)
            const source = Gio.File.new_for_path(default_conf_path)
            try {
                target_dir.make_directory_with_parents(null)
            } catch (e) {
                ; // directory already exists
            }
            source.copy(target, null, null, null)

            try {
                s = Shell.get_file_contents_utf8_sync(default_conf_path); // it seems confpath file is not ready yet, reading defaultconfpath
            } catch (e) {
                display("Failed to create the default file")
                return;
            }
        }
        return s.split("\n")
    }


    disable() {
        this.accelerators.forEach(actions => actions.disconnect())  // ungrab the accelerators
        global.display.disconnect(this.handler_accelerator_activated) // stop listening to the accelerators, none left
        this._remove_handler_keypress()
        keymap.disconnect(this.handler_state_changed)  // stop listening to keyboard-locks changes
    }

    get_state() {
        // XX scroll_lock_state is not available via Clutter in Gnome 3.36.
        // It was available via Gdm which does not work in Wayland.
        // Check in the further version of Gnome whether scroll_lock state was restored or get rid of it.
        return [keymap.get_num_lock_state(), keymap.get_caps_lock_state(),
        keymap.get_scroll_lock_state ? keymap.get_scroll_lock_state() : 0
        ]
    }

    /**
     * We have launched a layered shortcut.
     * Start a key press listener to identify which one should be triggered.
     * @param {Action[]} candidates
     */
    layered_shortcut(candidates) {
        if (!candidates.length) { // no action was a layer action
            return
        }

        const layers = []
        this._handler_keypress_init()
        this.handler_keypress.connect_after(
            'key-press-event',
            (actor, event) => {
                const symbol = String.fromCharCode(event.get_key_symbol())
                layers.push(symbol)

                candidates = candidates.filter(action => arraysEqual(action.layers.slice(0, layers.length), layers))
                if (!candidates.length) {
                    // no candidate for the layered shortcut, give up
                    this._remove_handler_keypress()
                    return
                }
                const triggrable = candidates.filter(action => arraysEqual(action.layers, layers))
                if (triggrable.length) {
                    // an action was triggered, treat launching layered shortcut as completed
                    // and return the keyboard focus to the previous input
                    triggrable.map(action => action.trigger())
                    this._remove_handler_keypress()
                }
            }
        )
        this.handler_keypress.connect(
            'key-focus-out',
            () => this._remove_handler_keypress()
        )
    }

    /**
     * A key press listener, invisible in GUI.
     */
    _handler_keypress_init() {
        if (this.handler_keypress) {
            const s = "Keypress handler already present"
            display(s)
            throw new Error(s)
        }
        this.handler_keypress = new St.Bin({
            reactive: true,
            can_focus: true,
        })
        Main.layoutManager.addChrome(this.handler_keypress, {
            affectsInputRegion: true,
            trackFullscreen: true,
        })
        this.handler_keypress.grab_key_focus()
    }

    _remove_handler_keypress() {
        if (this.handler_keypress) {
            this.handler_keypress.destroy()
            this.handler_keypress = null
            global.log("** Remove layer")
        }
    }
}

// Classes launched by gnome-shell
function init(options) {
    conf_path = ".config/run-or-raise/shortcuts.conf"; // CWD seems to be HOME
    default_conf_path = options.path + "/shortcuts.default";
}

function enable() {
    seat = Clutter.get_default_backend().get_default_seat()
    if (Meta.is_wayland_compositor()) {
        keymap = seat.get_keymap()
    } else {
        // We should not use Gdk in the extension, Clutter should be used instead.
        // Although it works, I've spotted its error (at least on Ubuntu 21.10, Gnome Shell 40.5, X11):
        // Usecase: Having the Num Lock on, restart shell -> keymap.get_num_lock_state() returns false unless manually
        // changed. Hence, we stay with Gdk for the moment.
        keymap = Gdk.Keymap.get_for_display(Gdk.Display.get_default())
    }
    app = new Controller()
    settings = ExtensionUtils.getSettings()
    app.enable()
}

function disable() {
    app.disable();
    pointer = keymap = seat = app = settings = null
}
