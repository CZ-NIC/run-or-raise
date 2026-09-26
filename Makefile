# Run "make" to compile the extension locally.
# Run "make release" to bump the version number and push a tag.
# Or "make commit-and-release" to commit the staged changes, alongside bumping the version number.
# Then GitHub Actions will publish to the extension store.

UUID ?= run-or-raise@edvard.cz

all: compile build

compile:
	glib-compile-schemas schemas

build:
	./scripts/pack.sh

test:
	npm test

release:
	./scripts/release.sh

commit-and-release:
	./scripts/release.sh --commit

.PHONY: all compile build test release commit-and-release
