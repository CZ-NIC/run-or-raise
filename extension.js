const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Gdk = imports.gi.Gdk

let app, conf_path, default_conf_path, settings;

function log() {
    // global.log.apply(null, arguments); // uncomment when debugging
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
    "RAISE_OR_REGISTER": "raise-or-register" // if nothing registered yet, register current
}))

/**
 * Registered windows to be raised
 * @type {{}}
 */
const register = []


/**
 * Binding based on https://superuser.com/questions/471606/gnome-shell-extension-key-binding/1182899#1182899
 * @type {Lang.Class}
 */
const KeyManager = new Lang.Class({
    Name: 'MyKeyManager',

    _init: function() {
        this.grabbers = new Map()

        global.display.connect(
            'accelerator-activated',
            Lang.bind(this, function(display, action, deviceId, timestamp) {
                log('Accelerator Activated: [display={}, action={}, deviceId={}, timestamp={}]',
                    display, action, deviceId, timestamp)
                this._onAccelerator(action)
            }))
    },

    listenFor: function(accelerator, callback) {

        //log('Trying to listen for hot key', accelerator)
        let action = global.display.grab_accelerator(accelerator, 0)
        if (action === Meta.KeyBindingAction.NONE) {
            log('Unable to grab accelerator [binding={}]', accelerator)
        } else {
            // Grabbed accelerator action
            // Receive binding name for action
            let name = Meta.external_binding_name_for_action(action)

            // Requesting WM to allow binding name
            Main.wm.allowKeybinding(name, Shell.ActionMode.ALL)

            this.grabbers.set(action, {
                name: name,
                accelerator: accelerator,
                callback: callback,
                action: action
            })
        }

    },

    _onAccelerator: function(action) {
        let grabber = this.grabbers.get(action)

        if (grabber) {
            this.grabbers.get(action).callback()
        } else {
            log('No listeners [action={}]', action)
        }
    }
});


class Shortcut {


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
        this.wm_class = wm_class
        this.title = title
        this.mode = mode
        this.wmFn = null
        this.titleFn = null;
        [this.wm_class, this.wmFn] = this._allow_regex(wm_class);
        [this.title, this.titleFn] = this._allow_regex(title);

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
        if (!s) {
            return [s, () => {
            }]
        } else if (s.substr(0, 1) === "/" && s.slice(-1) === "/") {
            // s is surround with slashes, ex: `/my-program/`, we want to do a regular match when searching
            return [new RegExp(s.substr(1, s.length - 2)), "search"]
        } else {  // s is a classic string, we just do indexOf match
            return [s, "indexOf"]
        }
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
        if (wm_class) { // seek by class
            // wm_class AND if set, title must match
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
            return false
        }

        if (this.mode.get(Mode.MOVE_WINDOW_TO_ACTIVE_WORKSPACE)) {
            const activeWorkspace = global.workspaceManager.get_active_workspace();
            window.change_workspace(activeWorkspace);
        }
        window.get_workspace().activate_with_focus(window, true)
        window.activate(0);
        if (this.mode.get(Mode.CENTER_MOUSE_TO_FOCUSED_WINDOW)) {
            const pointer = Gdk.Display.get_default().get_device_manager().get_client_pointer();
            const screen = pointer.get_position()[0];
            const center = window.get_center();
            pointer.warp(screen, center.x, center.y);
        }
        return true
    }

    /**
     * Trigger the shortcut (system does it)
     * @return {boolean|*}
     */
    trigger() {
        let [command, mode] = [this.command, this.mode];

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
            return imports.misc.util.spawnCommandLine(command)
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
                log('no focus, go to:' + seen.get_wm_class());
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
                        log('focus, go to:' + last_window.get_wm_class());
                        this.focus_window(last_window);
                    }
                }
            }
        }
        if (!seen || mode.get(Mode.ALWAYS_RUN)) {
            imports.misc.util.spawnCommandLine(command);
        }
    }

}

/**
 * Main controller to de/register shortcuts
 */
class Controller {

    enable() {
        let s;
        try {
            s = Shell.get_file_contents_utf8_sync(conf_path);
        } catch (e) {
            log("Run or raise: can't load confpath" + conf_path + ", creating new file from default");
            imports.misc.util.spawnCommandLine("mkdir -p " + conf_path.substr(0, conf_path.lastIndexOf("/")));
            imports.misc.util.spawnCommandLine("cp " + default_conf_path + " " + conf_path);
            try {
                s = Shell.get_file_contents_utf8_sync(default_conf_path); // it seems confpath file is not ready yet, reading defaultconfpath
            } catch (e) {
                log("Run or raise: Failed to create default file")
                return;
            }
        }
        let shortcuts = s.split("\n")
        this.keyManager = new KeyManager()

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
                let [shortcut, ...modes] = shortcut_mode.split(":")
                shortcut = shortcut.trim()
                // Store to "shortcut:cmd:launch(2)" → new Mode([["cmd", true], ["launch": 2]])
                let mode = new Mode(modes
                    .map(m => m.match(/(?<key>[^(]*)(\((?<arg>.*?)\))?/)) // "launch" -> key=launch, arg=undefined
                    .filter(m => m) // "launch" must be a valid mode string
                    .map(m => [m.groups.key, m.groups.arg || true])  // ["launch", true]
                )

                if (args.length <= 2) { // Run only mode, we never try to raise a window
                    mode.add(Mode.RUN_ONLY, true)
                }

                let shortcut_o = new Shortcut(command, wm_class, title, mode)
                this.keyManager.listenFor(shortcut, () => {
                    shortcut_o.trigger()
                })
            } catch (e) {
                log("Run or raise: can't parse line: " + line, e)
            }
        }
    }

    disable() {
        for (let it of this.keyManager.grabbers) {
            try {
                global.display.ungrab_accelerator(it[1].action)
                Main.wm.allowKeybinding(it[1].name, Shell.ActionMode.NONE)
            } catch (e) {
                log("Run or raise: error removing keybinding " + it[1].name)
                log(e)
            }
        }
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