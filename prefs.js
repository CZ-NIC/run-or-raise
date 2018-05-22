const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.uuid).gettext;
const GLib = imports.gi.GLib;
const Convenience = Me.imports.convenience;
function init() {  
    Convenience.initTranslations();
}

function buildPrefsWidget() {

  let convData = Convenience.getSchemaData();
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
	convData.basicSchema.forEach(function(data){
		vbox.add(booleanBox(data, convData.settings));
	});
  vbox.show_all();
  return vbox;  
}

function booleanBox(data, settings) {
  let vbox = new Gtk.Box({
    orientation : Gtk.Orientation.HORIZONTAL,
    margin : 10,
    margin_top : 15,
    spacing : 10
  });
  let switcher = new Gtk.Switch({active: data.value});
  let label = new Gtk.Label({label : data.summary});
  switcher.connect('notify::active', function(o) {
	  settings.set_boolean(data.name, o.active);
  });
  vbox.add(switcher);
  vbox.add(label);
  return vbox;
}
