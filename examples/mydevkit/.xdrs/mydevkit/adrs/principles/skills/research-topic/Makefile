# Bundles research-topic standalone, including its plan-research dependency (which itself
# bundles imagine-scenarios), per _core-adr-policy-021.
SHELL := /bin/bash
DEPS := ../plan-research
ZIP := research-topic.zip

build:
	rm -rf dist
	mkdir -p dist
	cp SKILL.md dist/
	cp -R .assets dist/
	cp -R references dist/
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
	$(MAKE) -C ../plan-research test
	test -f dist/SKILL.md
	test -f dist/.assets/table.json
	test -f dist/references/more-instructions.md
	test -f dist/plan-research/SKILL.md
	test -f dist/plan-research/imagine-scenarios/SKILL.md
	test -f dist/$(ZIP)
	@echo "research-topic bundling test passed"

clean:
	rm -rf dist
