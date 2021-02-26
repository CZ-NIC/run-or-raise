# Run-or-raise

https://extensions.gnome.org/extension/1336/run-or-raise/

# About project

I assume the run-or-raise style as the most efficient way of launching window. No more searching for your favourite program in a long menu, no more clicking on the icons. If the program already runs it'll get focus, else we launch it. Several years ago, OS creators finally realized that efficiency and let the users run-or-raise programs on the taskbar or dock by `<Super>+number` shortcuts. But what if you use more programs than nine? What if you don't want the unnecessary taskbar to occupy precious place on your screen?  
With the emergence of Wayland over X.org in Ubuntu 17.10, we can't reliably use good old `xbindkeys` and `jumpapp` to master shortcuts. Here is a gnome-shell extension that let you migrate your favourite shortcuts to `shortcuts.conf` file.

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

## How to create a shortcut

When you trigger a shortcut it lets you cycle amongst open instances of the application or if not found, launches a new instance. The file consists of shortcuts in the following form:

`shortcut[:mode],[command],[wm_class],[title]`

* `wm_class`, `title` and `mode` arguments are optional and case-sensitive
* if neither `wm_class` nor `title`  is set, lower-cased `command` is compared with lower-cased windows' wm_classes and titles
* multiple modes can be used together

## Modes

Modes are special instructions that let you change the triggered behaviour. Some of them can be turned on globally in the extension preferences (so you do not have to specify them for every single shortcut if you need them everywhere).

* `isolate-workspace` Switch windows on the active workspace only
* `minimize-when-unfocused` Minimizes your target when unfocusing
* `switch-back-when-focused` Switch back to the previous window when focused
* `move-window-to-active-workspace` Move window to current workspace before focusing. If the window is on a different workspace, moves the window to the workspace you're currently viewing.
* `center-mouse-to-focused-window` After focus move mouse to window center
* `always-run` Both runs the command and raises a window
    ```
    # Runs a command whether a window with wm_class 'kitty' is already open or not
    <Super>t:always-run,my_tmux_script.sh,kitty
    ```
* `run-only` Since it is very convenient to use a single file for all of your shortcuts (backup, migration to another system...), you can define standard shortcuts as well. These commands just get launched whenever the keys are hit and never raises a window. The keyword is implicit if no superfluous commas are noted in the line: `shortcut,command`   

    ```
    # this line will launch the notify-send command.
    <Super>h,notify-send Hello world
  
    # this line WILL raise a Firefox window or launches a command (note a trailing comma)
    <Super>f,firefox,
  
    # these equivalent lines will always launch a new Firefox instance, never raising a window
    <Super>f,firefox    
    <Super>f:run-only,firefox,
    ```
* `register(0)` Register the current window dynamically to be re-raised by using `raise` mode with the same number in the argument
  ```
  <Super><Ctrl>KP_0:register(1)
  <Super>KP_0:raise(1)
  <Super><Ctrl>KP_Delete:register(2)
  <Super>KP_Delete:raise(2)
  ```
* `raise(0)` Raise the windows previously registered by the `register` keyword
* `raise-or-register` If nothing registered yet, register the current window. Next time raise it unless the window is closed. In the example, we set <kbd>Super+i</kbd> and <kbd>Super+o</kbd> to bind a window each. 
  ```   
  <Super>i:raise-or-register
  <Super>o:raise-or-register  
  ```

## Examples

This line cycles any firefox window (matched by "firefox" in the window title) OR if not found, launches a new firefox instance:

```
<Super>f,firefox,,
```

This line cycles any open gnome-terminal OR if not found, launches a new one.

```
<Super>r,gnome-terminal,,
```

If you want to be sure that your browser won't be focused when you're on the page having "gnome-terminal" in the title, you may want to match running application by `wm_class = Gnome-terminal` on Ubuntu 17.10 or by `wm_class = gnome-terminal-server` on Arch... just check yourself by Alt+F2/lg/Windows everytime wm_class is needed.

```
<Super>r,gnome-terminal,Gnome-terminal,
```


You may use **regular expressions** in title or wm_class. Just put the expression between slashes.   
E.g. to jump to pidgin conversation window you may use this line
(that mean any windows of wm_class Pidgin, not containing the title Buddy List)"

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
* How to know the wm_class? Alt+f2, lg, "windows" tab (at least on Ubuntu 17.10)
* You may change the configuration file on the fly. Just disable & enable the extension, shortcuts load again from scratch.
* In the case of segfault, check no conflicting key binding (is present)[https://github.com/CZ-NIC/run-or-raise/pull/1#issuecomment-350951994], then submit an issue.
