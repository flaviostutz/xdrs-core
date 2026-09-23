SHELL := /bin/bash

clean:
	@rm -rf node_modules output pnpm-lock.yaml .filedist.lock .filedist.yml

install:
	pnpm add mydevkit@file:../dist/mydevkit-0.0.1.tgz xdrs-core@file:../../../dist/xdrs-core-0.0.1.tgz
	pnpm install

test: clean install
	pnpm exec mydevkit install --output ./output
	test -e output/AGENTS.md
	test -e output/.xdrs/_core/adrs/principles/001-xdrs-standards.md
	test -e output/.xdrs/mydevkit/adrs/principles/001-publish-mydevkit-as-an-extension-package.md
	test -e output/.xdrs/mydevkit/adrs/principles/articles/.assets/sample-package-asset.png
	test -e output/.agents/skills/release-package/SKILL.md
	grep -q "mydevkit/index.md" output/.xdrs/index.md
	pnpm exec mydevkit check --output ./output
	# consumer activation tags in the root index must survive a reinstall (see _core-adr-policy-022)
	sed -i.bak 's|^\[View scope mydevkit\](mydevkit/index.md)$$|& `disabled`|' output/.xdrs/index.md && rm output/.xdrs/index.md.bak
	grep -q 'mydevkit/index.md) `disabled`' output/.xdrs/index.md
	pnpm exec mydevkit install --output ./output
	grep -q 'mydevkit/index.md) `disabled`' output/.xdrs/index.md
	pnpm exec mydevkit check --output ./output
	@echo "All tests passed!"

lint: clean install
	pnpm exec mydevkit install --output ./output
	pnpm exec xdrs-core lint ./output