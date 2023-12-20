# Run-or-raise

https://extensions.gnome.org/extension/1336/run-or-raise/

# About project

I assume the run-or-raise style as the most efficient way of handling windows. No more searching for your favourite program in a long menu, no more clicking on the icons. If the program already runs it will get the focus, else we launch it.

Several years ago, OS creators finally realized that efficiency and let the users run-or-raise programs on the taskbar or dock by <kbd>Super+number</kbd> shortcuts. But what if you use more programs than nine? What if you do not want the unnecessary taskbar to occupy the precious place on the screen?

With the emergence of Wayland over X.org, we can't reliably use good old [`xbindkeys`](https://wiki.archlinux.org/index.php/Xbindkeys) and [`jumpapp`](https://github.com/mkropat/jumpapp) to master shortcuts. Here is a gnome-shell extension that let you migrate your favourite shortcuts to the `shortcuts.conf` file.

## Barebones “GNOME Shell native” alternative

Note that GNOME Shell supports a _basic_ run-or-raise workflow out of the box! In case this extension is broken or you cannot / don’t want to use it,

1. Pin your favorite apps to the Dash (`Activities` → `Right click` on open app → `Pin to Dash`)
2. Don’t let the default <kbd><Super+N></kbd> bindings cause you a left thumb [RSI](https://en.wikipedia.org/wiki/Repetitive_strain_injury)! To re-bind them, set dconf values `org.gnome.shell.keybindings` / `switch-to-application-N` to your desired keyboard shortcut (where N is 1..9), replacing / adding to the default binding.
3. Never re-order your pinned apps!
4. Enjoy a basic run-or-raise in Shell with no extension

Caveats:

- Limited to 9 apps! Choose wisely 😄.
- No wmclass regex support; limited to static `StartupWMClass` in XDG `.desktop` files
- No [run-or-raise "Modes"](#modes)

# Installation

* through GNOME3 [extensions](https://extensions.gnome.org/extension/1336/run-or-raise/
) (official, easy, not always up to date)

OR
* clone this repo to `/home/$USER/.local/share/gnome-shell/extensions/run-or-raise@edvard.cz`
* reload extensions (e.g. log out in wayland - [details here](https://gjs.guide/extensions/development/creating.html#testing-the-extension))
* enable run-or-raise in `gnome-extensions-app` panel
* in the extension preferences, you may edit `shortcuts.conf` file to use your own shortcuts
* you may load new shortcuts without restarting, just change the file `shortcuts.conf`, and disable and enable.

# Configuration

On the first run, `~/.config/run-or-raise/shortcuts.conf` gets created from [`shortcuts.default`](shortcuts.default) if not exists. There you define your own shortcuts.

Note that if an argument should contain a comma, use double quotes around.
```
<Super>i,"/usr/bin/cmd comma, needed",,application_title
```

## How to create a shortcut

When you trigger a shortcut it lets you cycle amongst open instances of the application or if not found, launches a new instance. The file consists of shortcuts in the following form:

`shortcut[ shortcut][:mode],command,[wm_class],[title]`

### Shortcut

Shortcut consists of an arbitrary number of modifiers (angle brackets) and a character (keysym), like `<Shift>a`, `<Shift><Super>a`, simple `a` or `<Super>slash`.

For custom shortcuts, I recommended using mostly combinations containing the modifier `<Super>` as this normally indicates global shortcuts. In the opposition to `<Shift>` which is semantically reserved for letter case `a/A`, `<Alt>` for underlined letters and `<Ctrl>` for various application-defined actions.

Possible modifiers:
* basic
  * `<Shift>`, `<Alt>`, `<Meta>`, `<Ctrl>` (`<Primary>`), `<Super>` known as <kbd>Win</kbd>, `<Hyper>`
  * you may not have all of them on your keyboard by default
  * `<ISO_Level5_Shift>` (I really recommend mapping this modifier instead of <kbd>Caps Lock</kbd>)
* mods
  * `<Mod1>`, `<Mod2>`, `<Mod3>`, `<Mod4>`, `<Mod5>`
  * consult `xmodmap` to see the overview of the keys that are mapped to mods
  * consult `xev` to determine key symbols you have mapped
  * ex: if the key <kbd>Alt Gr</kbd> corresponds with the key symbol `<ISO_Level3_Shift>` that is bound to **mod5**, you would use `<Mod5>` to create its shortcuts
  * ex: imagine you have both `<Super>` and `<Hyper>` on **mod4**. You bind them all by `<Super>i`, `<Hyper>i`, `<Mod4>i` shortcuts. As they are the same on the internal Gnome-level, only the first shortcut grabs the accelerator, the latter defined will not work. For more information, consult [Gnome/Mutter/core/meta-accel-parse.c](https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/core/meta-accel-parse.c) source code.
* non-standard locks: Not proper Gnome shortcuts implemented by the extension allow to control the accelerators being listened to depending on the keyboard locks state.
  * `<Num_Lock>`, `<Num_Lock_OFF>`
  * `<Caps_Lock>`, `<Caps_Lock_OFF>`
  * `<Scroll_Lock>`, `<Scroll_Lock_OFF>` (`Scroll_Lock` might not be available in Wayland session, hence might be removed in the future)

Multiple actions may be registered to the same shortcut (a shortcut appears on multiple lines). They get lauched sequentionally.
```
<Super>e,notify-send appears first
<Super>e,notify-send appears second
```

Layered shortcuts are possible. After the shortcut is hit, you may specify one or more shortcuts to be hit in order to trigger the action.
```
<Super>e a,notify-send Launched a
<Super>e b,notify-send Launched b
<Super>e c d,notify-send Launched cd
<Super>e c e,notify-send Launched ce
<Super>g,notify-send Launched "<Super>g"
<Super>e <Super>g,notify-send Launched "<Super>e and then <Super>g"
<Super>e <Super>e e,notify-send Launched "<Super>e e"
```

If you need to discover a [keysym](https://wiki.linuxquestions.org/wiki/List_of_keysyms), I recommend the `xev` program again.
```
<Super>grave,notify-send Using backtick in the shortcut: `
```

### Action: `command`, `wm_class` and `title`
* `command` can be either:
  * a command line instruction to be spawned in a new process
  * the name of an application's .desktop file to be activated
* `wm_class` and `title` arguments are optional and case-sensitive
* if neither `wm_class` nor `title` is set, lower-cased `command` is compared with lower-cased windows' wm_classes and titles

#### Understanding `title` and `wm_class`
The `title` is shown in the header area. Since the title tends to be dynamically changed by the application, you can use `wm_class` which compares to both parts (both `WM_CLASS_NAME` and `WM_CLASS_INSTANCE`) of this window property.

How to know the `wm_class`?
Just use the `xprop` program and filter the `WM_CLASS` line:

```bash
$ xprop
# hit the mail window with the mouse cursor and get:
WM_CLASS(STRING) = "mail.google.com__mail_u_0", "Google-chrome"
```

The first string `mail.google.com__mail_u_0` is more specific `WM_CLASS_INSTANCE`, the second `Google-chrome` is more stable `WM_CLASS_NAME`.

Alternatively, you can use the looking glass tool (at least on Ubuntu 17.10+) by launching <kbd>Alt+f2</kbd> / `lg` / "Windows" tab. There, you see `WM_CLASS_NAME` listed as `wmclass`. To get the `WM_CLASS_INSTANCE`, click on a window title / button "Insert" / go back to the "Evaluator" tab and refer the window via the inserted value `r` like: `r(0).get_wm_class_instance()`.
I found no easier solution for the moment.

#### Comparison of different matching approaches

Following shortcut will firstly launch mail window in an application mode. Later on, it will cycle all windows that have `mail.google.com` in the `wm_class`. (Which is what we want here.)

```
<Super>e,/opt/google/chrome/google-chrome --app=https://mail.google.com/mail/u/0,mail.google.com,
```

In an opposite manner, this would cycle all Chrome windows. (Which is not what we want.)

```
<Super>e,/opt/google/chrome/google-chrome --app=https://mail.google.com/mail/u/0,Google-chrome,
```

And finally, using the `title` part rather than the `wm_class` part, this would cycle all windows that have Gmail in the title. On one side this would include windows just mentioning Gmail (bad). On the other side when somebody writes you to the chat, the window title changes and the shortcut would open another Gmail instance (even worse).

```
<Super>e,/opt/google/chrome/google-chrome --app=https://mail.google.com/mail/u/0,,Gmail
```

### Modes

Modes are special instructions that let you change the triggered behaviour. Some of them can be turned on globally in the extension preferences (so you do not have to specify them for every single shortcut if you need them everywhere).

You can combine multiple modes by appending a colon. On the first hit, we register a window. On the second, we raise it while bringing to the active workspace.
```
<Super>i:raise-or-register:move-window-to-active-workspace
```

#### `isolate-workspace`
Switch windows on the active workspace only
  ```
  # cycles Firefox instances in the current workspace
  <Super>KP_1:isolate-workspace,firefox,
  ```
#### `minimize-when-unfocused`
Minimizes your target when unfocusing
#### `switch-back-when-focused`
Switch back to the previous window when focused. If a shortcut has no but a single window to cycle, it focuses last used window instead of doing nothing.
#### `move-window-to-active-workspace`
Move window to current workspace before focusing. If the window is on a different workspace, moves the window to the workspace you're currently viewing.
#### `center-mouse-to-focused-window`
After focus move mouse to window center
#### `always-run`
Both runs the command and raises a window
```
# Runs a command whether a window with wm_class 'kitty' is already open or not
<Super>t:always-run,my_tmux_script.sh,kitty
```
#### `run-only`
Since it is very convenient to use a single file for all of your shortcuts (backup, migration to another system...), you can define standard shortcuts as well. These commands just get launched whenever the keys are hit and never raises a window. The keyword is implicit if no superfluous commas are noted in the line: `shortcut,command`

```
# this line will launch the notify-send command.
<Super>y,notify-send Hello world

# this line WILL raise a Firefox window or launches a command (note a trailing comma)
<Super>f,firefox,

# these equivalent lines will always launch a new Firefox instance, never raising a window
<Super>f,firefox
<Super>f:run-only,firefox,
```
#### `register(0)`
Register the current window dynamically to be re-raised by using `raise` mode with the same number in the argument
```
<Super><Ctrl>KP_0:register(1)
<Super>KP_0:raise(1)
<Super><Ctrl>KP_Delete:register(2)
<Super>KP_Delete:raise(2)
```
#### `raise(0)`
Raise the windows previously registered by the `register` keyword
#### `raise-or-register`
If nothing registered yet, register the current window. Next time raise it unless the window is closed. In the example, we set <kbd>Super+i</kbd> and <kbd>Super+o</kbd> to bind a window each.
```
<Super>i:raise-or-register
<Super>o:raise-or-register
```
#### `raise-or-register(0)`
If nothing has been registered yet, register the current window. Next time, raise it, unless the window is closed or has been remapped with `register(the same number)`. Thus, it is a combination of `register`, `raise`, and `raise-or-register`.
#### `verbose`
Popups debug details via `notify-send`. (Normally it seems launched commands pipe the output to the `/var/log/syslog`.)


## Examples

This line cycles any firefox window (matched by "firefox" in the window title) OR if not found, launches a new firefox instance:

```
<Super>f,firefox,,
```

This line starts gnome-terminal using it's .desktop file:

```
<Super>f,org.gnome.Terminal.desktop,,
```

This line cycles any open gnome-terminal OR if not found, launches a new one.

```
<Super>r,gnome-terminal,,
```

If you want to be sure that your browser won't be focused when you're on the page having "gnome-terminal" in the title, you may want to match running application by `wm_class = Gnome-terminal` on Ubuntu 17.10 or by `wm_class = gnome-terminal-server` on Arch... just check yourself by Alt+F2/lg/Windows everytime `wm_class` is needed.

```
<Super>r,gnome-terminal,Gnome-terminal,
```


You may use **regular expressions** in `title` or `wm_class`. Just put the expression between slashes.
E.g. to jump to pidgin conversation window you may use this line
(that mean any windows of `wm_class` Pidgin, not containing the title Buddy List)"

```
<Super>KP_1,pidgin,Pidgin,/^((?!Buddy List).)*$/
```

To match `Google-chrome` and not `Google-chrome-beta`, help yourself with `$` sign to mark the end of matched text.
```
<Super>KP_3,gtk-launch google-chrome.desktop,/Google-chrome$/,
<Super><Shift>KP_3,gtk-launch google-chrome-beta.desktop,Google-chrome-beta,
```

Another occasion you'd use regulars would be the case when you'd like to have multiple applications on single keystroke. In the following example, shortcut `Super+Ctrl+(Numpad)4` focuses an IDE editor, either NetBeans or PyCharm. Because I'm mainly using NetBeans but for Python language I prefer PyCharm, I was wrong too often till I set single keystroke for both. (However, when no IDE is open, for launching NetBeans I use numpad and for PyCharm the 4 on the 4th row of keyboard.)

```
<Super><Ctrl>4,/opt/pycharm-community-2017.2.4/bin/pycharm.sh,,/(NetBeans IDE|PyCharm)/
<Super><Ctrl>KP_4,/opt/netbeans/bin/netbeans,,/(NetBeans IDE|PyCharm)/
```

To run a command as a sudo, try simple `pkexec` program that raises the password dialogue. For a repetitive task, familiarise yourself with the system sudoers file.
```
<Super>r,bash -c 'notify-send "Root folder" "`pkexec ls /root/`"'
```

# Tips
* For the examples, see [shortcuts.default](shortcuts.default) file.
* You may change the configuration file on the fly. Just disable & enable the extension, shortcuts load again from scratch. Ex: `gnome-extensions disable run-or-raise@edvard.cz && gnome-extensions enable run-or-raise@edvard.cz`
* In the case of segfault, check no conflicting key binding [is present](https://github.com/CZ-NIC/run-or-raise/pull/1#issuecomment-350951994), then submit an issue.

## Developer guide

How to implement a new mode?

* create new static keyword in the `Mode` class in the [mode.js](lib/mode.js) file
* create the same in [gschema.xml](schemas/org.gnome.shell.extensions.run-on-raise.gschema.xml) if the keyword should be available globally for all the shortcuts and run `make compile`
* put the logics into `Action.trigger` method, by checking if the settings is on (either locally per shortcut or globally) by `this.mode.get(Mode.KEYWORD)`
  * you may need [gjs.guide](https://gjs.guide/extensions), [gnome-shell source](https://gitlab.gnome.org/GNOME/gnome-shell/-/tree/main/js/) or [gjs-docs.gnome.org](https://gjs-docs.gnome.org)
* document here in the [README.md](README.md)
* put a description into [CHANGELOG.md](CHANGELOG.md) file
* raise a version in [metadata.json](metadata.json)
* create a pull request with (preferably) a single commit

### Debugging
When tired of logging out to refresh the code, launch a new wayland session ex by:

```
(sleep 1 && gnome-extensions disable run-or-raise@edvard.cz & ) && dbus-run-session -- gnome-shell --nested --wayland && gnome-extensions enable run-or-raise@edvard.cz
```

What does this command do? Note that the extension must be running in the main session in order to be started in the nested session too. So after a second, we disable it in the main session to not interfere with the nested instance of the extension: They share the same shortcuts and the main would prevail. When the nested session is over, enable it in the main session again.
