# Bundles research-topic standalone, including its plan-research dependency (which itself
# bundles imagine-scenarios), per _core-adr-policy-021.
SHELL := /bin/bash
DEPS := ../plan-research
BUILD := dist/build
ZIP := research-topic.zip

build: clean
	mkdir -p $(BUILD)
	cp SKILL.md $(BUILD)/
	cp -R .assets $(BUILD)/
	cp -R references $(BUILD)/
	@for d in $(DEPS); do \
	  name=$$(basename $$d); \
	  mkdir -p $(BUILD)/dist/$$name; \
	  if [ -f $$d/Makefile ]; then \
	    $(MAKE) -C $$d build; \
	    cp -R $$d/dist/build/. $(BUILD)/dist/$$name/; \
	  else \
	    cp $$d/SKILL.md $(BUILD)/dist/$$name/; \
	  fi; \
	  sed -i.bak "s#$$d/SKILL.md#dist/$$name/SKILL.md#g" $(BUILD)/SKILL.md && rm -f $(BUILD)/SKILL.md.bak; \
	done
	cd $(BUILD) && zip -rq ../$(ZIP) .

test: build
	$(MAKE) -C ../plan-research test
	test -f $(BUILD)/SKILL.md
	test -f $(BUILD)/.assets/table.json
	test -f $(BUILD)/references/more-instructions.md
	test -f $(BUILD)/dist/plan-research/SKILL.md
	test -f $(BUILD)/dist/plan-research/dist/imagine-scenarios/SKILL.md
	test -f dist/$(ZIP)
	@echo "research-topic bundling test passed"

clean:
	rm -rf dist
