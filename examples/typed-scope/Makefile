SHELL := /bin/bash

clean:
	@rm -rf node_modules .filedist.lock .xdrs/_core AGENTS.md pnpm-lock.yaml

install:
	pnpm install

lint: install
	pnpm exec xdrs-core install
	pnpm exec xdrs-core lint .

test: lint
