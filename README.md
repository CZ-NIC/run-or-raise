# Run-or-raise

https://extensions.gnome.org/extension/1336/run-or-raise/

# About project

I assume the run-or-raise style as the most efficient way of handling windows. No more searching for your favourite program in a long menu, no more clicking on the icons. If the program already runs it will get the focus, else we launch it. Several years ago, OS creators finally realized that efficiency and let the users run-or-raise programs on the taskbar or dock by <kbd>Super+number</kbd> shortcuts. But what if you use more programs than nine? What if you do not want the unnecessary taskbar to occupy the precious place on the screen?  
With the emergence of Wayland over X.org in Ubuntu 17.10, we can't reliably use good old `[xbindkeys](https://wiki.archlinux.org/index.php/Xbindkeys)` and `[jumpapp](https://github.com/mkropat/jumpapp)` to master shortcuts. Here is a gnome-shell extension that let you migrate your favourite shortcuts to the `shortcuts.conf` file.

# Installation

* through GNOME3 [extensions](https://extensions.gnome.org/extension/1336/run-or-raise/
) (official, easy, not always up to date)

OR
* put this dir to `/home/$USER/.local/share/gnome-shell/extensions`
* enable in `gnome-shell-extension-prefs` panel
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

`shortcut[:mode],[command],[wm_class],[title]`

* `wm_class`, `title` and `mode` arguments are optional and case-sensitive
* `command` can be either a commandline to launch, or the name of an application's .desktop file.
If `command` is a commandline, this extension will spawn a new process using that commandline. If `command` points to a .desktop
file, this extension will activate the application from that .desktop file.
* if neither `wm_class` nor `title`  is set, lower-cased `command` is compared with lower-cased windows' wm_classes and titles
* multiple modes can be used together
* multiple actions may be registered to the same shortcut
* `shortcut` modifiers
  * basic
    * `<Shift>`, `<Alt>`, `<Meta>`, `<Ctrl>` (`<Primary>`), `<Super>` known as <kbd>Win</kbd>, `<Hyper>` 
    * you may not have all of them on your keyboard by default
    * `<ISO_Level5_Shift>` (I really recommend mapping this modifier instead of <kbd>Caps Lock</kbd>)
  * mods
    * `<Mod1>`, `<Mod2>`, `<Mod3>`, `<Mod4>`, `<Mod5>`
    * consult `xmodmap` to see the overview of the keys that are mapped to mods
    * consult `xev` to determine key symbols you have mapped
    * ex: if the key <kbd>Alt Gr</kbd> corresponds with the key symbol `<ISO_Level3_Shift>` that is bound to **mod5**, you would use `<Mod5>` to create its shortcuts
    * ex: imagine you have both `<Super>` and `<Hyper>` on **mod4**. You bind them all by `<Super>i`, `<Hyper>i`, `<Mod4>i` shortcuts. As they are the same on the internal Gnome-level, only the first shortcut grabs the accelerator, the latter defined will not work. For more information, consult [Gnome/Mutter/core/meta-accel-parse.c](https://gitlab.gnome.org/GNOME/mutter/-/blob/master/src/core/meta-accel-parse.c) source code.
  * non-standard locks: Not proper Gnome shortcuts implemented by the extension allow to control the accelerators being listened to depending on the keyboard locks state.
    * `<Num_Lock>`, `<Num_Lock_OFF>`
    * `<Caps_Lock>`, `<Caps_Lock_OFF>`
    * `<Scroll_Lock>`, `<Scroll_Lock_OFF>` (`Scroll_Lock` might not be available in Wayland session, hence might be removed in the future)

## Modes

Modes are special instructions that let you change the triggered behaviour. Some of them can be turned on globally in the extension preferences (so you do not have to specify them for every single shortcut if you need them everywhere).

You can combine multiple modes by appending a colon. On the first hit, we register a window. On the second, we raise it while bringing to the active workspace.
```
<Super>i:raise-or-register:move-window-to-active-workspace
```

### `isolate-workspace`
Switch windows on the active workspace only
  ```
  # cycles Firefox instances in the current workspace
  <Super>KP_1,firefox,
  ```
### `minimize-when-unfocused`
Minimizes your target when unfocusing
### `switch-back-when-focused`
Switch back to the previous window when focused
### `move-window-to-active-workspace`
Move window to current workspace before focusing. If the window is on a different workspace, moves the window to the workspace you're currently viewing.
### `center-mouse-to-focused-window`
After focus move mouse to window center
### `always-run`
Both runs the command and raises a window
```
# Runs a command whether a window with wm_class 'kitty' is already open or not
<Super>t:always-run,my_tmux_script.sh,kitty
```
### `run-only`
Since it is very convenient to use a single file for all of your shortcuts (backup, migration to another system...), you can define standard shortcuts as well. These commands just get launched whenever the keys are hit and never raises a window. The keyword is implicit if no superfluous commas are noted in the line: `shortcut,command`   

```
# this line will launch the notify-send command.
<Super>h,notify-send Hello world

# this line WILL raise a Firefox window or launches a command (note a trailing comma)
<Super>f,firefox,

# these equivalent lines will always launch a new Firefox instance, never raising a window
<Super>f,firefox    
<Super>f:run-only,firefox,
```
### `register(0)`
Register the current window dynamically to be re-raised by using `raise` mode with the same number in the argument
```
<Super><Ctrl>KP_0:register(1)
<Super>KP_0:raise(1)
<Super><Ctrl>KP_Delete:register(2)
<Super>KP_Delete:raise(2)
```
### `raise(0)`
Raise the windows previously registered by the `register` keyword
### `raise-or-register`
If nothing registered yet, register the current window. Next time raise it unless the window is closed. In the example, we set <kbd>Super+i</kbd> and <kbd>Super+o</kbd> to bind a window each. 
```   
<Super>i:raise-or-register
<Super>o:raise-or-register  
```
### `verbose`
Put debug details into system log (possible at `/var/log/syslog`) and popups some of them via `notify-send`. (Normally it seems launched commands pipe the output to the *syslog* as well.)


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

# Tips
* For the examples, see [shortcuts.default](shortcuts.default) file.
* How to know the `wm_class`? <kbd>Alt+f2</kbd>, `lg`, "windows" tab (at least on Ubuntu 17.10)
* You may change the configuration file on the fly. Just disable & enable the extension, shortcuts load again from scratch.
* In the case of segfault, check no conflicting key binding [is present](https://github.com/CZ-NIC/run-or-raise/pull/1#issuecomment-350951994), then submit an issue.

## Developer guide

How to implement a new mode?

* create new static keyword in the `Mode` class in the main [extension.js](extension.js) file
* create the same in [gschema.xml](schemas/org.gnome.shell.extensions.run-on-raise.gschema.xml) if the keyword should be available globally for all the shortcuts
* put the logics into `Action.trigger` method, by checking if the settings is on (either locally per shortcut or globally) by `this.mode.get(Mode.KEYWORD)`
  * you may need [gjs.guide](https://gjs.guide/extensions), [gnome-shell source](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/master/js/) or [gjs-docs.gnome.org](https://gjs-docs.gnome.org)
* document here in the [README.md](README.md)
* put a description into [CHANGELOG.md](CHANGELOG.md) file
* raise a version in [metadata.json](metadata.json)
* create a pull request with (preferably) a single commit
