const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Gdk = imports.gi.Gdk

function log() {
     // global.log.apply(null, arguments); // uncomment when debugging
}

/**
 * Allow user to cast a specific instruction
 */
const Mode = Object.freeze({
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
})

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

        log('Trying to listen for hot key', accelerator)
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
     * Closure returns the event handler triggered by system on a shortcut
     * @param command
     * @param wm_class
     * @param title
     * @param {dict(mode, parameter)} mode
     * @return function
     */
    constructor(command = "", wm_class = "", title = "", modes = null) {
        this.command = command
        this.wm_class = wm_class
        this.title = title
        this.modes = modes
        this.wmFn = null
        this.titleFn = null;
        [this.wm_class, this.wmFn] = this._allow_regex(wm_class);
        [this.title, this.titleFn] = this._allow_regex(title);
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
        const active_workspace = (settings.get_boolean('isolate-workspace') || this.modes[Mode.ISOLATE_WORKSPACE]) ?
            workspace_manager.get_active_workspace() : null

        // fetch windows
        return global.display.get_tab_list(0, active_workspace)
    }


    is_conforming(wm) {
        let [command, wm_class, wmFn, title, titleFn] = [this.command, this.wm_class, this.wmFn, this.title, this.titleFn];

        const window_class = wm.get_wm_class() || '';
        const window_title = wm.get_title() || '';
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
        const modes = this.modes
        if (check
            && (!window  // gnome shell reloaded and window IDs changed (even if window might be still there)
                || !this.get_windows().filter(w => w.get_id() == window.get_id()).length // window closed
            )) {
            return false
        }

        if (settings.get_boolean('move-window-to-active-workspace') || modes[Mode.MOVE_WINDOW_TO_ACTIVE_WORKSPACE]) {
            const activeWorkspace = global.workspaceManager.get_active_workspace();
            window.change_workspace(activeWorkspace);
        }
        window.get_workspace().activate_with_focus(window, true)
        window.activate(0);
        if (settings.get_boolean('center-mouse-to-focused-window') || modes[Mode.CENTER_MOUSE_TO_FOCUSED_WINDOW]) {
            const pointer = Gdk.Display.get_default().get_device_manager().get_client_pointer();
            const screen = pointer.get_position()[0];
            const center = window.get_center();
            pointer.warp(screen, center.x, center.y);
        }
        return true
    }

    /**
     * Trigger the shortcut
     * @return {boolean|*}
     */
    trigger() {
        let [command, modes] = [this.command, this.modes];
        // Shortcut has been triggered
        let i;
        if ((i = modes[Mode.RAISE_OR_REGISTER])) {
            if (!this.registered_window || !this.focus_window(this.registered_window, true)) {
                this.registered_window = this.get_windows()[0]
            }
            return
        }
        if ((i = modes[Mode.REGISTER])) {
            return register[i] = this.get_windows()[0]  // will stay undefined if there is no such window
            // return register[i] = this.get_windows()[50] // May raise an exception, XXX try with [20]
        }
        if ((i = modes[Mode.RAISE])) {
            return this.focus_window(register[i], true)
        }

        if (modes[Mode.RUN_ONLY]) {
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
                if (settings.get_boolean('minimize-when-unfocused') || modes[Mode.MINIMIZE_WHEN_UNFOCUSED]) {
                    seen.minimize();
                }
                if (settings.get_boolean('switch-back-when-focused') || modes[Mode.SWITCH_BACK_WHEN_FOCUSED]) {
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
        if (!seen || modes[Mode.ALWAYS_RUN]) {
            imports.misc.util.spawnCommandLine(command);
        }
    }

}

class Controller {

    enable() {
        let s;
        try {
            s = Shell.get_file_contents_utf8_sync(confpath);
        } catch (e) {
            log("Run or raise: can't load confpath" + confpath + ", creating new file from default");
            // imports.misc.util.spawnCommandLine("cp " + defaultconfpath + " " + confpath);
            imports.misc.util.spawnCommandLine("mkdir -p " + confpath.substr(0, confpath.lastIndexOf("/")));
            imports.misc.util.spawnCommandLine("cp " + defaultconfpath + " " + confpath);
            try {
                s = Shell.get_file_contents_utf8_sync(defaultconfpath); // it seems confpath file is not ready yet, reading defaultconfpath
            } catch (e) {
                log("Run or raise: Failed to create default file")
                return;
            }
        }
        let shortcuts = s.split("\n");
        this.keyManager = new KeyManager();

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

                // Split shortcut[:mode][:mode] -> shortcut, modes
                let [shortcut, ...modes] = shortcut_mode.split(":")
                shortcut = shortcut.trim()
                // Store to "shortcut:cmd:launch(2)" → modes = {"cmd": true, "launch": 2}
                modes = Object.assign({}, ...modes
                    .map(m => m.match(/(?<key>[^(]*)(\((?<arg>.*?)\))?/)) // "launch" -> key=launch, arg=undefined
                    .filter(m => m && Object.values(Mode).includes(m.groups.key)) // "launch" must be a valid Mode
                    .map(m => ({[m.groups.key]: m.groups.arg || true}))) // {"launch": true}

                if (args.length <= 2) { // Run only mode, we never try to raise a window
                    modes[Mode.RUN_ONLY] = true
                }

                this.keyManager.listenFor(shortcut, () => {
                    new Shortcut(command, wm_class, title, modes).trigger()
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

var app, confpath, confdir, defaultconfpath, settings;

function init(options) {
    confpath = ".config/run-or-raise/shortcuts.conf"; // CWD seems to be HOME
    defaultconfpath = options.path + "/shortcuts.default";
    app = new Controller();
    settings = Convenience.getSettings();
}

function enable(settings) {
    app.enable();
}

function disable() {
    app.disable();
}