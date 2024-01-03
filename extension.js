import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import Shell from 'gi://Shell'
import St from 'gi://St'
import Gio from 'gi://Gio'
import Clutter from 'gi://Clutter'
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'

// Local imports
import { parseLine } from './lib/action.js'
import { Accelerator } from './lib/accelerator.js'
import { arraysEqual, DefaultMap } from './lib/static.js'

// Typedef
/**
 * @typedef {boolean[]} State Array of true/false
 */
let conf_path, default_conf_path


/**
 * All known modifiers needed to allow layered shortcut to bear another modifiered shortcuts
 * without being cancelled.
 */
const MODIFIERS = [Clutter.KEY_Alt_L, Clutter.KEY_Alt_R,
Clutter.KEY_Control_L, Clutter.KEY_Control_R,
Clutter.KEY_Super_L, Clutter.KEY_Super_R,
Clutter.KEY_Hyper_L, Clutter.KEY_Hyper_R,
Clutter.KEY_Shift_L, Clutter.KEY_Shift_R,
Clutter.KEY_Meta_L, Clutter.KEY_Meta_R,
]

/**
 * Main controller to de/register shortcuts
 */
class App {

    display(text, title = "") {
        Main.notify("Run-or-raise " + title, String(text))
    }

    error(text, title = "") {
        this.display(text, title || "Error")
        throw new Error("Run-or-raise> " + text)
    }

    constructor(settings, seat, keymap) {
        this.settings = settings
        this.verbose = this.settings.get_boolean("verbose")
        this.seat = seat
        this.keymap = keymap

        /**
         * Registered windows to be raised
         * @type {{}}
         */
        this.register = []
        /**
         * Accelerators currently connected to the WM.
         * @type {Map<Number, Accelerator>} [accelerator.action_id] => accelerator
         */
        this.accelerator_map = new Map()

        this.handler_accelerator_activated = null
        this.handler_layered = null
        this.handler_state_changed = null

        /**
         *
         * @type {DefaultMap<String,Accelerator>} {shortcut => [action, ...]}
         */
        this.accelerators = new DefaultMap((shortcut) => new Accelerator(shortcut, this))

        /**
         *
         * @type {DefaultMap<String,Accelerator>} {shortcut => [action, ...]}
         */
        this.layered_accelerators = new DefaultMap((shortcut) => new Accelerator(shortcut, this))

        /**
         * @type {Accelerator[]}
         */
        this.unblock_later = new Set
    }

    enable() {
        /* XX Note Ubuntu 20.10: Using modifiers <Mod3> – <Mod5> worked well for me, <Mod2> (xmodmap shows a numlock)
        consumed the shortcut when Num_Lock (nothing printed out) but it seems nothing was triggered here.

        Keymap.get_modifier_state() returns an int 2^x where x is 8 positions of xmodmap*/
        const shortcuts = this._fetch_shortcuts()
        if (!shortcuts) {
            return
        }

        // Catch the signal that one of system-defined accelerators has been triggered
        this.handler_accelerator_activated = global.display.connect(
            'accelerator-activated',
            (display_, action, deviceId, timestamp) => {
                try {
                    const accelerator = this.accelerator_map.get(action)
                    if (!accelerator) {
                        // ex: Fn+volume_up for an unknown reason ends up here
                        return
                    }
                    if (this.handler_layered) {
                        this.layer_finished()

                        if (!accelerator.is_layered) {
                            // another accelerator activated while handling a layered shortcut → ignore
                            return false
                        }
                    }
                    const layered = accelerator.trigger()
                    if (layered.length) { // start layered mode
                        this.layered_mode_start(layered)
                    } else {
                        this.layered_mode_stop()
                    }
                } catch (e) {
                    this.error(e, "Accelerator failed")
                }
            }
        )

        // parse shortcut file
        for (const line of shortcuts) {
            try {
                if (line[0] === "#" || line.trim() === "") {  // skip empty lines and comments
                    continue
                }
                const action = parseLine(line, this)
                this.accelerators.get(action.shortcut).push(action)
            } catch (e) {
                this.display(`Cannot parse line: ${line}.${e}`)
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
        this.accelerators.forEach(accelerator => {
            // Launch only generic shortcuts (not lock-dependent) (group having no no-lock shortcuts amongst)
            if (accelerator.some(action => action.get_state().every(lock => lock === null))) { // these are always on
                accelerator.connect()
            } else { // these are lock-dependent, on only if keyboard-locks match
                lock_dependent_accelerators.push(accelerator)
            }
        })

        // De/register accelerators depending on the keyboard state
        let last_state = []
        const on_state_changed = () => {
            const state = this.get_state()
            if (!arraysEqual(state, last_state)) {
                lock_dependent_accelerators.forEach(acc => acc.on_state_changed(last_state))
                last_state = state
            }
        }

        this.handler_state_changed = this.keymap.connect('state-changed', on_state_changed)
        on_state_changed()

    }

    _fetch_shortcuts() {
        let s;
        try {
            s = Shell.get_file_contents_utf8_sync(conf_path);
        } catch (e) {
            this.display(`Cannot load confpath ${conf_path}, creating new file from default`)
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
                this.display("Failed to create the default file")
                return
            }
        }
        return s.split("\n")
    }


    disable() {
        this.accelerators.forEach(actions => actions.disconnect())  // ungrab the accelerators
        global.display.disconnect(this.handler_accelerator_activated) // stop listening to the accelerators, none left
        this.layered_mode_stop()
        this.keymap.disconnect(this.handler_state_changed)  // stop listening to keyboard-locks changes
    }

    get_state() {
        // XX scroll_lock_state is not available via Clutter in Gnome 3.36.
        // It was available via Gdm which does not work in Wayland.
        // Check in the further version of Gnome whether scroll_lock state was restored or get rid of it.
        return [this.keymap.get_num_lock_state(), this.keymap.get_caps_lock_state(),
        this.keymap.get_scroll_lock_state ? this.keymap.get_scroll_lock_state() : 0
        ]
    }

    /**
     * We have launched a layered shortcut.
     * Start a key press listener to identify which one should be triggered.
     * @param {Action[]} candidates
     */
    layered_mode_start(candidates) {
        candidates.map(action => {
            const new_action = action.get_layered_action()
            if (this.accelerators.has(new_action.shortcut)) {
                this.unblock_later.add(this.accelerators.get(new_action.shortcut).block())
            }
            this.layered_accelerators.get(new_action.shortcut).push_layered(new_action)
        })

        this.layered_accelerators.forEach(acc => acc.connect())
        this._handler_layered_init(this.verbose)
    }

    /**
     * A key press listener, invisible in GUI. Used when a layered shortcut has been triggered.
    * @param {boolean} debug Visually display listenered. So that we can see it disappears (stop listening).
    */
    _handler_layered_init(debug = false) {
        if (this.handler_layered) {
            return // handler already present from the last layer
        }
        this.handler_layered = new St.Bin({
            reactive: true,
            can_focus: true
        })
        if (debug) {
            this.handler_layered.width = 100
            this.handler_layered.height = 100
            this.handler_layered.style = 'background-color: gold'
            this.handler_layered.set_position(0, 0)
        }
        Main.layoutManager.addChrome(this.handler_layered, {
            affectsInputRegion: true,
            trackFullscreen: true,
        })
        this.handler_layered.grab_key_focus()

        // When listeren gets a key (which is not a modifier) this means
        // the user has written a key was not grabbed as a layered accelerator.
        // → Stop listening to layered accelerators.
        this.handler_layered.connect_after(
            'key-press-event',
            (_, event) => MODIFIERS.includes(event.get_key_symbol()) ? null : this.layered_mode_stop()
        )
        this.handler_layered.connect(
            'key-focus-out',
            () => this.layered_mode_stop()
        )
    }

    /**
     * Next layer, wipe accelerators of the previous layer
     */
    layer_finished() {
        this.layered_accelerators.forEach(temp_accelerator => temp_accelerator.disconnect())
        this.layered_accelerators.clear()
    }

    layered_mode_stop() {
        this.layer_finished()
        this.unblock_later.forEach(acc => acc.unblock())
        this.unblock_later.clear()

        if (this.handler_layered) {
            this.handler_layered.destroy()
            this.handler_layered = null
        }
    }
}

export default class RunOrRaiseExtension extends Extension {
    constructor(metadata) {
        super(metadata)
        conf_path = ".config/run-or-raise/shortcuts.conf" // CWD is be HOME
        default_conf_path = this.metadata.path + "/shortcuts.default"
    }

    enable() {
        const seat = Clutter.get_default_backend().get_default_seat()
        const keymap = seat.get_keymap()
        this.app = new App(this.getSettings(), seat, keymap)
        this.app.enable()
    }

    disable() {
        this.app.disable()
        this.app = null
    }
}
