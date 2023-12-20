import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import * as Convenience from './convenience.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';


export default class RunOrRaisePreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        window._settings = this.getSettings();

        const page = new Adw.PreferencesPage();

        page.add(this.getShortcutConfig());
        page.add(this.getBehaviourConfig());

        window.add(page);
    }

    getShortcutConfig() {
        const group = new Adw.PreferencesGroup({
            title: "Shortcuts",
        });

        const row = new Adw.ActionRow({
            title: 'Open shortcuts.conf file',
            subtitle: 'Edit the file to add your shortcuts, then reload this extension (no logout required)',
        });
        let editorButton = new Gtk.Button({
            iconName: "document-open-symbolic",
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER
        });
        editorButton.connect("clicked", function() {
            GLib.spawn_command_line_sync("xdg-open .config/run-or-raise/shortcuts.conf");
        });
        row.add_suffix(editorButton);
        row.set_activatable_widget(editorButton);

        group.add(row);

        return group;
    }

    getBehaviourConfig() {
        const group = new Adw.PreferencesGroup({
            title: "Behaviour",
            description: "Configure various behaviours of run or raise"
        });
        let convData = Convenience.getSchemaData(this.getSettings());

        convData.basicSchema.forEach(function(data) {
            group.add(booleanBox(data, convData.settings));
        });

        return group;
    }
}

function booleanBox(data, settings) {
        const row = new Adw.SwitchRow({
            title: data.summary,
            subtitle: data.description ? data.description : "",
        });
        settings.bind(data.name, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row
}