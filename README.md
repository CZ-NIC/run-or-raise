Run-or-raise
============

https://extensions.gnome.org/extension/1336/run-or-raise/

IMPORTANT Upgrade Notice
======
Backup your shortcuts.conf when **upgrading**, since GNOME will wipe it. (Since the new version, shortcuts.conf will be saved in `~/.config/run-or-raise/` safely.)
(This notice will be removed after Ubuntu 20.04 LTS release.)

About project
=============

I assume the run-or-raise style as the most efficient way of launching window. No more searching for your favourite program in a long menu, no more clicking on the icons. If the program already runs it'll get focus, else we launch it. Several years ago, OS creators finally realized that efficiency and let the users run-or-raise programs on the taskbar or dock by `<Super>+number` shortcuts. But what if you use more programs than nine? What if you don't want the unnecessary taskbar to occupy precious place on your screen?  
With the emergence of Wayland over X.org in Ubuntu 17.10, we can't reliably use good old `xbindkeys` and `jumpapp` to master shortcuts. Here is a gnome-shell extension that let you migrate your favourite shortcuts to `shortcuts.conf` file.

Installation
============

* through GNOME3 [extensions](https://extensions.gnome.org/extension/1336/run-or-raise/
) (official, easy, not always up to date)

OR
* put this dir to `/home/$USER/.local/share/gnome-shell/extensions`
* enable in `gnome-shell-extension-prefs` panel
* in the extension preferences, you may edit `shortcuts.conf` file to use your own shortcuts
* you may load new shortcuts without restarting, just change the file `shortcuts.conf`, and disable and enable.

Configuration
=============

On the first run, `shortcuts.conf` gets created from `shortcuts.default` if not exists. There you define your own shortcuts. The shortcuts may be defined in two ways:

#### Note:

If a command needs to contain commas, the pipe character (|) should be used as a separator.

## Run or raise form

This form let you cycle between open instances of the application or if not found, launches a new instance.

 Run-or-raise form: `shortcut,command,[wm_class],[title][,mode]`
   * wm_class, title and mode are optional and case sensitive
   * if none is set, lowercased launch-command is compared with lowercased windows wm_classes and titles


### Examples:


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

## Always run and raise

To run a command/script whether a window is already open or not, add the always-run parameter (mode) to the definition.
```
<Super>t,my_tmux_script.sh,kitty,,always-run
```

## Run only form

Since it is very convenient to use a single file for all of your shortcuts (backup, migration to another system...), you can define standard shortcuts as well. These commands just get launched whenever the keys are hit.

Run only form: `shortcut,command`

### Examples:

This line will launch notify-send command.

```
<Super>h,notify-send Hello world
```


Tips
===
* For the examples, see [shortcuts.default](shortcuts.default) file.
* How to know wm_class? Alt+f2, lg, "windows" tab (at least on Ubuntu 17.10)
* You may change the configuration file on the fly. Just disable & enable the extension, shortcuts load again from scratch.
* In the case of segfault, check no conflicting keybind (are present)[https://github.com/CZ-NIC/run-or-raise/pull/1#issuecomment-350951994], then submit an issue.
