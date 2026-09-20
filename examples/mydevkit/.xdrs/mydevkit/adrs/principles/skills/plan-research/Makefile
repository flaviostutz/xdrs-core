# Bundles plan-research standalone, including its imagine-scenarios dependency, which has no
# bundling Makefile of its own (_core-adr-policy-021).
SHELL := /bin/bash
DEPS := ../imagine-scenarios
ZIP := plan-research.zip

build:
	rm -rf dist
	mkdir -p dist
	cp SKILL.md dist/
	@for d in $(DEPS); do \
	  name=$$(basename $$d); \
	  mkdir -p dist/$$name; \
	  if [ -f $$d/Makefile ]; then \
	    $(MAKE) -C $$d build; \
	    cp -R $$d/dist/. dist/$$name/; \
	  else \
	    cp $$d/SKILL.md dist/$$name/; \
	  fi; \
	  sed -i.bak "s#$$d/SKILL.md#$$name/SKILL.md#g" dist/SKILL.md && rm -f dist/SKILL.md.bak; \
	done
	cd dist && zip -rq ../$(ZIP) .
	mv $(ZIP) dist/$(ZIP)

test: build
	test -f dist/SKILL.md
	test -f dist/imagine-scenarios/SKILL.md
	test -f dist/$(ZIP)
	@echo "plan-research bundling test passed"

clean:
	rm -rf dist
