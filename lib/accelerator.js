import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// const { Meta, Shell } = imports.gi
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
// const ExtensionUtils = imports.misc.extensionUtils

// const Me = ExtensionUtils.getCurrentExtension()
// const { arraysEqual } = Me.imports.lib.static
import {arraysEqual} from './static.js';

/**
 *  @typedef {Action[]} Accelerator Actions in the array have the same shortcut accelerator.
 *  XX do not know how to document the values of a class extending array properly
 */
export class Accelerator extends Array {

    /**
     *
     * @param {String} shortcut
     * @param {App} app
     */
    constructor(shortcut, app) {
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

        this.app = app

        this.blocked = false
        this.connect_on_unblock = null
        this.is_layered = false
    }

    on_state_changed(last_state) {
        const state = this.app.get_state()
        let conforms = this.some(action => action.state_conforms(state))

        if (this.action_id !== null && !conforms) { // the shortcut must no more be consumed
            this.disconnect()
        } else if (this.action_id === null && conforms) { // enable new state shortcuts
            this.connect()
        } else if (this.action_id !== null && conforms
            && !arraysEqual(this.filter_actions(), this.filter_actions(last_state))) {
            // re-do the set of the actions performed on accelerator trigger
            // ex: Num_Lock state change while having both `<Num_Lock_OFF>i` and `<Num_Lock>i` defined
            this.disconnect()
            this.connect()
        }
    }

    /**
     *
     * @param {?State} state
     * @returns {Action[]}
     */
    filter_actions(state = null) {
        return this.filter(action => action.state_conforms(state || this.app.get_state()))
    }

    /**
     * Grab the accelerator, start listening.
     * @param state Only actions conforming the system keyboard-lock state will be registered
     */
    connect() {
        if (this.blocked) {
            return false
        }
        const state = this.app.get_state()
        let action_id = global.display.grab_accelerator(this.shortcut, 0);
        if (action_id === Meta.KeyBindingAction.NONE) {
            this.app.display(`Unable to grab accelerator: ${this.shortcut}`);
            return false;
        }
        // Grabbed accelerator action, receive its binding name
        this.action_id = action_id;
        this.name = Meta.external_binding_name_for_action(action_id);

        // Requesting WM to allow binding name
        Main.wm.allowKeybinding(this.name, Shell.ActionMode.ALL);
        this.app.accelerator_map.set(action_id, this)
    }

    /**
     * Run the accelerator and all of its actions
     * @returns Action[] These actions were not run because they are layered = dependent on following key hits.
     */
    trigger() {
        return this.filter_actions().filter(action => {
            try {
                if (action.layers.length) {
                    return action
                }
                action.trigger()
            } catch (e) {
                this.app.display(`${this.shortcut} ${e}`);
            }
        })
    }

    disconnect() {
        if (this.action_id === null) {
            return;
        }
        try {
            global.display.ungrab_accelerator(this.action_id);
            Main.wm.allowKeybinding(this.name, Shell.ActionMode.NONE);
            this.app.accelerator_map.delete(this.action_id)
            this.action_id = null;
        } catch (e) {
            this.app.display(`Error removing keybinding ${this.name}: ${e}`);
        }
    }

    /**
     * Blocked accelerator cannot be connected.
     * Use case: when using a layered shorcut having the same key combination,
     *  we temporarily disable the original one. However, when a NumLock changes
     *  (not because of a keyboard which would be registered and ended up layered session
     *  but because of an external cause),
     *  we do not want the original accelerator to connect
     *  (which would fail, cannot grab twice the same combination).
     */
    block() {
        if (!this.blocked) {
            this.blocked = true
            if ((this.connect_on_unblock = Boolean(this.action_id))) {
                this.disconnect()
            }
        }
        return this
    }

    unblock() {
        if (this.blocked) {
            this.blocked = false
            if (this.connect_on_unblock) {
                this.connect()
            }
        }
        return this
    }

    /**
     * Pushes the action and at once, mark itself as a layred accelerator.
     * @param {Action} action
     */
    push_layered(action) {
        this.push(action)
        this.is_layered = true
    }
}

