# Run "make" to compile the extension locally.
# Run "make release" to bump the version number and push a tag.
# Then GitHub Actions will publish to the extension store.

UUID ?= run-or-raise@edvard.cz

all: compile build

compile:
	glib-compile-schemas schemas

build:
	./scripts/pack.sh

release:
	./scripts/release.sh

.PHONY: all compile build release
