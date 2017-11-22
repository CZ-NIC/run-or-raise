const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Shell = imports.gi.Shell;

KeyManager = new Lang.Class({ // based on https://superuser.com/questions/471606/gnome-shell-extension-key-binding/1182899#1182899
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
        log("action:")
        log(action)

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
                callback: callback,
                action: action
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
      function _prepare(s) {
            if(s.substr(0,1) === "/" && s.slice(-1) === "/")  {
                return [new RegExp(s.substr(1, s.length-2)), "search"];                
            }
            else {
                return [s, "indexOf"];
            }
        }
      
    return function() {                    
        var launch = shortcut[1].trim();        
        var wm_class, wmFn, title, titleFn;                
        [wm_class, wmFn] = _prepare(shortcut[2].trim());
        [title, titleFn] = _prepare(shortcut[3].trim());        
        
        let seen = 0;
        for (let w of global.get_window_actors()) {
            var wm = w.get_meta_window();
            if(wm_class) { // seek by class
                if(wm.get_wm_class()[wmFn](wm_class) > -1 && (!title || wm.get_title()[titleFn](title) > -1)) {
                    seen = wm; // wm_class AND if set, title must match
                    break;                             
                    }                                
            } else if( (title && (wm.get_title()[titleFn](title) > -1) ) || // seek by title
                (!title && ((wm.get_wm_class().toLowerCase().indexOf(launch.toLowerCase()) > -1) || // seek by launch-command in wm_class
                (wm.get_title().toLowerCase().indexOf(launch.toLowerCase()) > -1))) // seek by launch-command in title
                ) { 
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
    try {
        var s = Shell.get_file_contents_utf8_sync(confpath);
    }
    catch(e) {
        log("Run or raise: can't load confpath" + confpath + ", creating new file from default");                
        imports.misc.util.spawnCommandLine("cp " + defaultconfpath + " " + confpath);
        try {
            var s = Shell.get_file_contents_utf8_sync(defaultconfpath); // it seems confpath file is not ready yet, reading defaultconfpath
        }
        catch(e) {
            log("Run or raise: Failed to create default file")
            return;
        }        
    }
    this.shortcuts = s.split("\n");         
    this.keyManager = new KeyManager();
    
    for(let line of this.shortcuts) {
        try {
            if(line[0] == "#" || line.trim() == "") {                
                continue;   
            }            
            let s = line.split(",")            
            if(s.length > 2) { // shortcut, launch, wm_class, title            
                this.keyManager.listenFor(s[0].trim(), this.jumpapp(s))
            } else { // shortcut, command
                this.keyManager.listenFor(s[0].trim(), function() {imports.misc.util.spawnCommandLine(s[1].trim())})
            }                            
            
        } catch(e) {
            log("Run or raise: can't parse line: " + line)
        }        
    }
  }

  disable() {      
        for (let it of this.keyManager.grabbers) {
            try {
                global.display.ungrab_accelerator(it[1].action)
                Main.wm.allowKeybinding(it[1].name, Shell.ActionMode.NONE)
            }
            catch(e) {
                log("Run or raise: error removing keybinding " + it[1].name)
                log(e)
            }                                
        }            
        }
      

};

var app, confpath, defaultconfpath;

function init(settings) {            
    confpath = settings.path + "/shortcuts.conf";
    defaultconfpath = settings.path + "/shortcuts.default";
    app = new Controller();
}

function enable(settings) {
  app.enable();
}

function disable() {
  app.disable();
}
