SHELL := /bin/bash

clean:
	@rm -rf dist node_modules
	make -C consumer clean

build: install
	pnpm pack --pack-destination=./dist

test: clean build
	make -C consumer test

lint: build
	make -C consumer lint

install:
	pnpm install