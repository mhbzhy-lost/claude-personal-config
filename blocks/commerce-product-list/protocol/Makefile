.PHONY: help install gen gen-ts gen-zod lint clean

help:
	@echo "Targets:"
	@echo "  install   Install JS deps (pnpm)"
	@echo "  gen       Generate both TS types and zod client"
	@echo "  gen-ts    Generate TS types from openapi.yaml"
	@echo "  gen-zod   Generate zod schemas + zodios client"
	@echo "  lint      Lint openapi.yaml with spectral"
	@echo "  clean     Remove generated/ + node_modules"

install: node_modules

node_modules: package.json
	pnpm install

gen-ts: install
	pnpm gen:ts

gen-zod: install
	pnpm gen:zod

gen: gen-ts gen-zod

lint: install
	pnpm lint

clean:
	rm -rf node_modules generated
