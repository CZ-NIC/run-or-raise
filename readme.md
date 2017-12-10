Run-or-raise
============

https://extensions.gnome.org/extension/1336/run-or-raise/

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


## Run or raise form

This form let you cycle between open instances of the application or if not found, launches a new instance.

 Run-or-raise form: `shortcut,command,[wm_class],[title]`
   * wm_class and title are optional and case sensitive
   * if none is set, lowercased launch-command is compared with lowercased windows wm_classes and titles

### Examples:


This line cycles any firefox window (matched by "firefox" in the window title) OR if not found, launches a new firefox instance:

```
<Super>f,firefox,,
```

This line cycles any open gnome-terminal (matched by `wm_class = gnome-terminal-server`) OR if not found, launches a new one.

```
<Super>r,gnome-terminal,gnome-terminal-server,
```

You may use **regular expressions** in title or wm_class. Just put the expression between slashes.   
E.g. to jump to pidgin conversation window you may use this line
(that mean any windows of wm_class Pidgin, not containing the title Buddy List)"

```
<Super>KP_1,pidgin,Pidgin,/^((?!Buddy List).)*$/
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
