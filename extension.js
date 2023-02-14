const Main = imports.ui.main;
const { Meta, Shell, St, Gdk, Gio, Clutter } = imports.gi
const ExtensionUtils = imports.misc.extensionUtils
const Me = ExtensionUtils.getCurrentExtension()

// Local imports
/**
 * @typedef {import('./lib/action.js')}
*/
const Action = Me.imports.lib.action.Action
/**
 * @typedef {import('./lib/accelerator.js')}
*/
const Accelerator = Me.imports.lib.accelerator.Accelerator
/**
 * @typedef {import('./lib/mode.js').Mode} Mode
*/
const Mode = Me.imports.lib.mode.Mode
/**
 * @typedef {import('./lib/static.js')}
*/
const { arraysEqual, DefaultMap, display } = Me.imports.lib.static

// Typedef
/**
 * @typedef {boolean[]} State Array of true/false
 */
let seat, pointer, keymap, conf_path, default_conf_path, settings
/**
 * @type {App}
 */
let app

/**
 * Registered windows to be raised
 * @type {{}}
*/
const register = []

/**
 * Main controller to de/register shortcuts
 */
class App {

    enable() {
        /* XX Note Ubuntu 20.10: Using modifiers <Mod3> – <Mod5> worked good for me, <Mod2> (xmodmap shows a numlock)
        consumed the shortcut when Num_Lock (nothing printed out) but it seems nothing was triggered here.

        Keymap.get_modifier_state() returns an int 2^x where x is 8 positions of xmodmap*/
        const shortcuts = this._fetch_shortcuts()
        if (!shortcuts) {
            return
        }
        /**
         * @type {Map<Number, Function>} [Accelerator.action_id] => callback to execute all actions
         */
        this.grabbers = new Map()

        // Catch the signal that one of system-defined accelerators has been triggered
        this.handler_accelerator_activated = global.display.connect(
            'accelerator-activated',
            (display_, action, deviceId, timestamp) => this.grabbers.get(action)() // ex: Fn+volume_up raises TypeError not a function
        )

        /**
         *
         * @type {DefaultMap<String,Accelerator>} {shortcut => [action, ...]}
         */
        const accelerators = new DefaultMap((shortcut) => new Accelerator(shortcut, this))
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
    app = new App()
    settings = ExtensionUtils.getSettings()
    app.enable()
}

function disable() {
    app.disable();
    pointer = keymap = seat = app = settings = null
}
