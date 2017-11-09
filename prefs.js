const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.uuid).gettext;
const GLib = imports.gi.GLib;
function init() {  
}

function buildPrefsWidget() {

  let vbox = new Gtk.Box({
    orientation : Gtk.Orientation.VERTICAL,
    margin : 10,
    margin_top : 15,
    spacing : 10
  });        
  let editorButton = new Gtk.Button({label: "Open shortcuts.conf file"});
    editorButton.connect("clicked",function(){
        let stuff = GLib.spawn_command_line_sync("xdg-open " + Me.path + "/shortcuts.conf");
    });    
  let settingLabel = new Gtk.Label({label : "Edit the file to add your shortcuts, then reload this extension (no logout required)"});    
    
  vbox.add(settingLabel);
  vbox.add(editorButton);
  vbox.show_all();
  return vbox;  
}
