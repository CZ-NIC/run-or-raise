const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Shell = imports.gi.Shell;

// Import the convenience.js (Used for loading settings schemas)
const Self = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Self.imports.convenience;

// Import config
const config = Self.imports.config;



function AppKeys() {
  this.init();
}

KeyManager = new Lang.Class({
    Name: 'MyKeyManager',

    _init: function() {
        this.grabbers = new Map()

        global.display.connect(
            'accelerator-activated',
            Lang.bind(this, function(display, action, deviceId, timestamp){
                log('Accelerator Activated: [display={}, action={}, deviceId={}, timestamp={}]',
                    display, action, deviceId, timestamp)
                this._onAccelerator(action)
            }))
    },

    listenFor: function(accelerator, callback){
        log('Trying to listen for hot key [accelerator={}]', accelerator)
        let action = global.display.grab_accelerator(accelerator)

        if(action == Meta.KeyBindingAction.NONE) {
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
                callback: callback
            })
        }

    },

    _onAccelerator: function(action) {
        let grabber = this.grabbers.get(action)

        if(grabber) {
            this.grabbers.get(action).callback()
        } else {
            log('No listeners [action={}]', action)
        }
    }
});

class Controller {


  //This is a javascript-closure which will return the event handler
  //for each hotkey with it's id. (id=1 For <Super>+1 etc)
  jumpapp(shortcut) {    
    return function() {                
        var launch = shortcut[1].strip();
        var wm_class = shortcut[2].strip().toLowerCase();
        var title = shortcut[3].strip().toLowerCase() ;                                                      
        
    
        
        let seen = 0;
        for (let w of global.get_window_actors()) {
            var wm = w.get_meta_window();
            if(wm_class && wm_class == wm.get_wm_class().toLowerCase()) { // seek by class                
                if(title && wm.get_title().toLowerCase().indexOf(title) < 0)  {                    
                    continue; // if set, title must match
                }
                seen = wm;
                break;
            } else if(wm.get_title().toLowerCase().indexOf(title|| launch) > -1) { // seek by title                
                seen = wm;
                break;
            }
        } 
        if(seen) {            
            wm.activate(0);   
        } else {
            imports.misc.util.spawnCommandLine(launch);
        }
        return;
      }
    }

  enable() {
    /* FORMAT
     shortcut, launch, wm_class, title
      OR
     shortcut, command
     */
    
    //Shell.get_file_contents_utf8_sync("/home/edvard/edvard/www/run-or-raise@e2rd.cz/shortcuts.conf");
    try {
        let s = Shell.get_file_contents_utf8_sync(confpath);
    }
    catch() {
        log("Run or raise - cant load confpath" + confpath);
        return;
    }
    this.shortcuts = s.split("\n");         
    let keyManager = new KeyManager();
    
    for(let line of this.shortcuts) {
        try {
            if(line[0] == "#") {
                continue;   
            }
            let s = line.split(",")
            if(s.length > 2) { // shortcut, launch, wm_class, title            
                keyManager.listenFor(s[0].strip(), this.jumpapp(s))
            } else { // shortcut, command
                keyManager.listenFor(s[0].strip(), function() {imports.misc.util.spawnCommandLine(s[1].strip())})
            }
        } finally {
            log("Run or raise: can't parse line: " + line)
        }        
    }
  }

  disable() {
      log("Run or raise - disabling shortcuts havent been implemented. Restart the session.");    
      /*for(let line of this.shortcuts) {
        try {
            if(line[0] == "#") {
                continue;   
            }
            let s = line.split(",")
            s[0]
            
        }
        finally {}
      }*/
  }

};

var app, confpath;

// create app keys app
function init(settings) {            
    confpath = settings.path + "/shortcuts.conf";
    app = new Controller();
}

function enable(settings) {
  app.enable();
}

function disable() {
  app.disable();
}
