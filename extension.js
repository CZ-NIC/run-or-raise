const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Gdk = imports.gi.Gdk

function log() {
    // global.log.apply(null, arguments); uncomment when debugging
}

const KeyManager = new Lang.Class({ // based on https://superuser.com/questions/471606/gnome-shell-extension-key-binding/1182899#1182899
    Name: 'MyKeyManager',

    _init: function () {
        this.grabbers = new Map()

        global.display.connect(
            'accelerator-activated',
            Lang.bind(this, function (display, action, deviceId, timestamp) {
                log('Accelerator Activated: [display={}, action={}, deviceId={}, timestamp={}]',
                    display, action, deviceId, timestamp)
                this._onAccelerator(action)
            }))
    },

    listenFor: function (accelerator, callback) {

        log('Trying to listen for hot key [accelerator={}]', accelerator)
        let action = global.display.grab_accelerator(accelerator, 0)
        log("action:")
        log(action)

        if (action == Meta.KeyBindingAction.NONE) {
            log('Unable to grab accelerator [binding={}]', accelerator)
        } else {
            log('Grabbed accelerator [action={}]', action)
            let name = Meta.external_binding_name_for_action(action)
            log('Received binding name for action [name={}, action={}]',
                name, action)

            log('Requesting WM to allow binding [name={}]', name)
            Main.wm.allowKeybinding(name, Shell.ActionMode.ALL)

            this.grabbers.set(action, {
                name: name,
                accelerator: accelerator,
                callback: callback,
                action: action
            })
        }

    },

    _onAccelerator: function (action) {
        let grabber = this.grabbers.get(action)

        if (grabber) {
            this.grabbers.get(action).callback()
        } else {
            log('No listeners [action={}]', action)
        }
    }
});


const Controller = new Lang.Class({ // based on https://superuser.com/questions/471606/gnome-shell-extension-key-binding/1182899#1182899
    Name: 'MyController',

    //This is a javascript-closure which will return the event handler
    //for each hotkey with it's id. (id=1 For <Super>+1 etc)
    jumpapp: function (shortcut) {
        function _prepare(s) {
            // Return appropriate method for s
            if (s.substr(0, 1) === "/" && s.slice(-1) === "/") {
                // s is entoured with slashes, ex: `/my-program/`, we want to do a regular match when searching
                return [new RegExp(s.substr(1, s.length - 2)), "search"];
            } else {  // s is a classic string, we just do indexOf match
                return [s, "indexOf"];
            }
        }

        return function () {
            var launch = shortcut[1].trim();
            var wm_class, wmFn, title, titleFn;
            [wm_class, wmFn] = _prepare(shortcut[2].trim());
            [title, titleFn] = _prepare(shortcut[3].trim());

            let seen = 0;

            let is_conforming = function (wm) {
                var window_class = wm.get_wm_class() || '';
                var window_title = wm.get_title() || '';
                // check if the current window is conforming to the search criteria
                if (wm_class) { // seek by class
                    // wm_class AND if set, title must match
                    if (window_class[wmFn](wm_class) > -1 && (!title || window_title[titleFn](title) > -1)) {
                        return true;
                    }
                } else if ((title && window_title[titleFn](title) > -1) || // seek by title
                    (!title && ((window_class.toLowerCase().indexOf(launch.toLowerCase()) > -1) || // seek by launch-command in wm_class
                        (window_title.toLowerCase().indexOf(launch.toLowerCase()) > -1))) // seek by launch-command in title
                ) {
                    return true;
                }
                return false;
            };

            var loop;
            if (global.display.get_tab_list(0, null).length === 0) {
                loop = [];
            } else if (is_conforming(global.display.get_tab_list(0, null)[0])) {
                // current window conforms, let's focus the oldest windows of the group
                loop = global.display.get_tab_list(0, null).slice(0).reverse();
            } else {
                // current window doesn't conform, let's find the youngest conforming one
                loop = global.display.get_tab_list(0, null); // Xglobal.get_window_actors()
            }
            for (var wm of loop) {
                if (is_conforming(wm)) {
                    seen = wm;
                    if (!seen.has_focus()) {
                        break; // there might exist another window having the same parameters
                    }
                }
            }
            if (seen) {
                if (!seen.has_focus()) {
                    log('no focus, go to:' + seen.get_wm_class());
                    focusWindow(seen);
                } else if (settings.get_boolean('switch-back-when-focused')) {
                    const window_monitor = wm.get_monitor();
                    const window_list = global.display.get_tab_list(0, null).filter(w => w.get_monitor() === window_monitor && w !== wm);
                    const lastWindow = window_list[0];
                    if (lastWindow) {
                        log('focus, go to:' + lastWindow.get_wm_class());
                        focusWindow(lastWindow);
                    }
                }
            } else {
                imports.misc.util.spawnCommandLine(launch);
            }
            return;
        }
    },

    enable: function () {
        try {
            var s = Shell.get_file_contents_utf8_sync(confpath);
        } catch (e) {
            log("Run or raise: can't load confpath" + confpath + ", creating new file from default");
            // imports.misc.util.spawnCommandLine("cp " + defaultconfpath + " " + confpath);
            imports.misc.util.spawnCommandLine("mkdir -p "+ confpath.substr(0, confpath.lastIndexOf("/")));
            imports.misc.util.spawnCommandLine("cp " + defaultconfpath + " " + confpath);
            try {
                var s = Shell.get_file_contents_utf8_sync(defaultconfpath); // it seems confpath file is not ready yet, reading defaultconfpath
            } catch (e) {
                log("Run or raise: Failed to create default file")
                return;
            }
        }
        this.shortcuts = s.split("\n");
        this.keyManager = new KeyManager();

        for (let line of this.shortcuts) {
            try {
                if (line[0] == "#" || line.trim() == "") {
                    continue;
                }
                let s = line.split(",")
                if (s.length > 2) { // shortcut, launch, wm_class, title
                    this.keyManager.listenFor(s[0].trim(), this.jumpapp(s))
                } else { // shortcut, command
                    this.keyManager.listenFor(s[0].trim(), function () {
                        imports.misc.util.spawnCommandLine(s[1].trim())
                    })
                }

            } catch (e) {
                log("Run or raise: can't parse line: " + line)
            }
        }
    },

    disable: function () {
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


});

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

function focusWindow(wm) {
    if (settings.get_boolean('move-window-to-active-workspace')) {
        const activeWorkspace = global.workspaceManager.get_active_workspace();
        wm.change_workspace(activeWorkspace);
    }
    wm.get_workspace().activate_with_focus(wm, true);
    wm.activate(0);
    if (settings.get_boolean('center-mouse-to-focused-window')) {
        const display = Gdk.Display.get_default();//wm.get_display();
        const deviceManager = display.get_device_manager();
        const pointer = deviceManager.get_client_pointer();
        const screen = pointer.get_position()[0];
        const center = wm.get_center();
        pointer.warp(screen, center.x, center.y);
    }
}
