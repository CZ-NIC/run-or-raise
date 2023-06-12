# run simply with `make` to prepare a release
UUID=run-or-raise@edvard.cz

release:
	make compile
	make build
	xdg-open https://extensions.gnome.org/upload/

compile:
	glib-compile-schemas schemas

build:
	mkdir -p build

    # remove old build file so that we will not left deleted files from the last build
	zip -r - * -x Makefile "build/*" > "build/$(UUID)".zip

.PHONY: release compile build