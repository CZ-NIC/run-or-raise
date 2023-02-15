const Gtk = imports.gi.Gtk;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const GLib = imports.gi.GLib;
const Convenience = Me.imports.convenience;

function init() {
}

function buildPrefsWidget() {
        let convData = Convenience.getSchemaData();
        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 15,
            spacing: 10
        });
        let editorButton = new Gtk.Button({label: "Open shortcuts.conf file"});
        editorButton.connect("clicked", function() {
            GLib.spawn_command_line_sync("xdg-open .config/run-or-raise/shortcuts.conf");
        });
        let settingLabel = new Gtk.Label({label: "Edit the file to add your shortcuts, then reload this extension (no logout required)"});

        vbox.append(settingLabel);
        vbox.append(editorButton);
        convData.basicSchema.forEach(function(data) {
            vbox.append(booleanBox(data, convData.settings));
        });
        return vbox;
    }

function booleanBox(data, settings) {
        const vbox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 15,
            spacing: 10
        })
        const switcher = new Gtk.Switch({active: data.value})
        const text = data.summary + (data.description? ": " + data.description : "")
        const label = new Gtk.Label({label: text})
        switcher.connect('notify::active', function(o) {
            settings.set_boolean(data.name, o.active)
        })
        vbox.append(switcher)
        vbox.append(label)
        return vbox
}
