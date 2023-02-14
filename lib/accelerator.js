const Main = imports.ui.main;
const { Meta, Shell, St, Gdk, Gio, Clutter } = imports.gi
const ExtensionUtils = imports.misc.extensionUtils

const Me = ExtensionUtils.getCurrentExtension()
const { arraysEqual, display } = Me.imports.lib.static


/**
 *  @typedef {Action[]} Accelerator Actions in the array have the same shortcut accelerator.
 *  XX do not know how to document the values of a class extending array properly
 */
var Accelerator = class extends Array {

    /**
     *
     * @param {String} shortcut
     * @param {App} app
     */
    constructor(shortcut, app) {
        super();
        /**
         * ID of the grabber accelerator action.
         * We may use this ID to ungrab the accelerator.
         * All actions in this Accelerator have it in common
         * @type {?number}
         */
        this.action_id = null
        this.name = null
        this.shortcut = shortcut

        this.app = app
        /**
         * @type {?State}
         */
        this.state = null
    }

    on_state_changed(state, last_state) {
        let conforms = this.some(action => action.state_conforms(state));

        if (this.action_id !== null && !conforms) { // the shortcut must no more be consumed
            this.disconnect();
        } else if (this.action_id === null && conforms) { // enable new state shortcuts
            this.connect(state);
        } else if (this.action_id !== null && conforms
            && !arraysEqual(this.filter_actions(state), this.filter_actions(last_state))) {
            // re-do the set of the actions performed on accelerator trigger
            // ex: Num_Lock state change while having both `<Num_Lock_OFF>i` and `<Num_Lock>i` defined
            this.disconnect();
            this.connect(state);
        }
    }

    /**
     *
     * @param {State} state
     * @returns {Action[]}
     */
    filter_actions(state) {
        return this.filter(action => action.state_conforms(state));
    }

    /**
     * Grab the accelerator, start listening.
     * @param state Only actions conforming the system keyboard-lock state will be registered
     */
    connect(state) {
        let action = global.display.grab_accelerator(this.shortcut, 0);
        if (action === Meta.KeyBindingAction.NONE) {
            display(`Unable to grab accelerator: ${this.shortcut}`);
            return false;
        }
        // Grabbed accelerator action, receive its binding name
        this.action_id = action;
        this.name = Meta.external_binding_name_for_action(action);

        // Requesting WM to allow binding name
        Main.wm.allowKeybinding(this.name, Shell.ActionMode.ALL);
        this.app.accelerator_map.set(action, this)
        this.state = state
    }

    /**
     * Run the accelerator and all of its actions
     */
    trigger() {
        if(!this.state) {
            display("Error: Accelerator not connected")
        }
        this.app.layered_shortcut(this.filter_actions(this.state).filter(action => {
            try {
                if (action.layers.length) {
                    return action
                }
                action.trigger()
            } catch (e) {
                display(`${this.shortcut} ${e}`);
            }
        }))
    }

    disconnect() {
        if (this.action_id === null) {
            return;
        }
        try {
            global.display.ungrab_accelerator(this.action_id);
            Main.wm.allowKeybinding(this.name, Shell.ActionMode.NONE);
            this.action_id = null;
        } catch (e) {
            display(`Error removing keybinding ${this.name}: ${e}`);
        }
    }
}

