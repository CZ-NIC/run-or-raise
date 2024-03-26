/**
 * Allow user to cast a specific instruction
 */
export class Mode {

    /* Modes. The value should be the same as the one in gschema.xml as we can compare globals and shorcuts.conf keywords at once */
    /** both runs the command and raises a window */
    static ALWAYS_RUN = "always-run"
    /** just runs the command without cycling windows */
    static RUN_ONLY = "run-only"
    /** Switch windows on the active workspace only */
    static ISOLATE_WORKSPACE = "isolate-workspace"
    static MINIMIZE_WHEN_UNFOCUSED = "minimize-when-unfocused"
    static SWITCH_BACK_WHEN_FOCUSED = "switch-back-when-focused"
    static MOVE_WINDOW_TO_ACTIVE_WORKSPACE = "move-window-to-active-workspace"
    static CENTER_MOUSE_TO_FOCUSED_WINDOW = "center-mouse-to-focused-window"
    /** register current window to be re-raised by Mode.RAISE */
    static REGISTER = "register"
    /** raise the windows previously registered by Mode.REGISTER */
    static RAISE = "raise"
    /** if nothing registered yet, register current */
    static RAISE_OR_REGISTER = "raise-or-register"
    static VERBOSE = "verbose"

    /**
     * @param values Ex: [["cmd", true], ["launch": 2]]
     */
    constructor(values, settings) {
        this.values = []
        values.forEach(key_val => this.add(key_val[0], key_val[1]))
        this.settings = settings
    }

    /**
     * @param key
     * @return Current key value if contained in the current object or true if such key is on in the global settings
     */
    get(key) {
        try {
            return this.values[key] || this.settings.get_boolean(key)
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
            throw `Unknown mode: ${key}`
        }
        this.values[key] = val
    }
}