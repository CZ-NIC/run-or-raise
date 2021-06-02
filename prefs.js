const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.uuid).gettext;
const GLib = imports.gi.GLib;
const Convenience = Me.imports.convenience;
const Config = imports.misc.config;
const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major); // XX drop with Gnome Shell < 40 support

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    if (shellVersion > 39) {
        let convData = Convenience.getSchemaData();
        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            //margin : 10,
            margin_top: 15,
            spacing: 10
        });
        let editorButton = new Gtk.Button({label: "Open shortcuts.conf file"});
        editorButton.connect("clicked", function() {
            let stuff = GLib.spawn_command_line_sync("xdg-open " + Me.path + "/shortcuts.conf");
        });
        let settingLabel = new Gtk.Label({label: "Edit the file to add your shortcuts, then reload this extension (no logout required)"});

        vbox.append(settingLabel);
        vbox.append(editorButton);
        convData.basicSchema.forEach(function(data) {
            vbox.append(booleanBox(data, convData.settings));
        });
        //vbox.show_all();
        return vbox;
    } else {
        let convData = Convenience.getSchemaData();
        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin: 10,
            margin_top: 15,
            spacing: 10
        });
        let editorButton = new Gtk.Button({label: "Open shortcuts.conf file"});
        editorButton.connect("clicked", function() {
            let stuff = GLib.spawn_command_line_sync("xdg-open " + Me.path + "/shortcuts.conf");
        });
        let settingLabel = new Gtk.Label({label: "Edit the file to add your shortcuts, then reload this extension (no logout required)"});

        vbox.add(settingLabel);
        vbox.add(editorButton);
        convData.basicSchema.forEach(function(data) {
            vbox.add(booleanBox(data, convData.settings));
        });
        vbox.show_all();
        return vbox;
    }
}

function booleanBox(data, settings) {
    if (shellVersion > 39) {
        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            //margin : 10,
            margin_top: 15,
            spacing: 10
        });
        let switcher = new Gtk.Switch({active: data.value});
        let label = new Gtk.Label({label: data.summary});
        switcher.connect('notify::active', function(o) {
            settings.set_boolean(data.name, o.active);
        });
        vbox.append(switcher);
        vbox.append(label);
        return vbox;
    } else {
        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin: 10,
            margin_top: 15,
            spacing: 10
        });
        let switcher = new Gtk.Switch({active: data.value});
        let label = new Gtk.Label({label: data.summary});
        switcher.connect('notify::active', function(o) {
            settings.set_boolean(data.name, o.active);
        });
        vbox.add(switcher);
        vbox.add(label);
        return vbox;
    }
}
