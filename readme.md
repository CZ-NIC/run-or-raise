Run-or-raise
============

About project
=============

I assume the run-or-raise style as the most efficient way of launching window. No more searching for your favourite program in a long menu, no more clicking on the icons. If the program already runs it'll get focus, else we launch it. Several years ago, OS creators finally realized that efficiency and let the users run-or-raise programs on the taskbar or dock by `<Super>+number` shortcuts. But what if you use more programs than nine? What if you don't want the unnecessary taskbar to occupy precious place on your screen?  
With the emergence of Wayland over X.org in Ubuntu 17.10, we can't reliably use good old `xbindkeys` and `jumpapp` to master shortcuts. Here is a gnome-shell extension that let you migrate your favourite shortcuts to `shortcuts.conf` file.

Installation
============

* put this dir to `/home/$USER/.local/share/gnome-shell/extensions`
* enable in `gnome-shell-extension-prefs` panel
* in the extension preferences, you may edit `shortcuts.conf` file to use your own shortcuts
* you may load new shortcuts without restarting, just change the file `shortcuts.conf`, and disable and enable. (If you want to change a shortcut or make deleted shortcuts not work, log out first.)

Examples
========
For the examples, see [shortcuts.default](shortcuts.default) file.
