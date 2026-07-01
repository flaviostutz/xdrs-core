SHELL := /bin/bash

clean:
	@rm -rf .xdrs city-traffic .filedist.lock

build: clean
	node generate.js

lint: build
	node ../../lib/lint.js .

.PHONY: clean lint build
