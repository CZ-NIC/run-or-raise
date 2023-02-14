/**
 * Allow user to cast a specific instruction
 */
var Mode = class Mode {

    /**
     * @param values Ex: [["cmd", true], ["launch": 2]]
     */
    constructor(values) {
        this.values = [];
        values.forEach(key_val => this.add(key_val[0], key_val[1]));
    }

    /**
     * @param key
     * @return Current key value if contained in the current object or true if such key is on in the global settings
     */
    get(key) {
        try {
            return this.values[key] || settings.get_boolean(key);
        } catch (e) { // key does not exist in the global settings
            return false;
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
        this.values[key] = val;
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
