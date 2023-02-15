UUID=run-or-raise@edvard.cz
compile:
	glib-compile-schemas schemas

build:
	mkdir -p build

    # remove old build file so that we will not left deleted files from the last build
	zip -r - * -x Makefile "build/*" > "build/$(UUID)".zip

.PHONY: build