.PHONY: help install gen gen-ts gen-zod lint clean

help:
	@echo "Targets:"
	@echo "  install   pnpm install"
	@echo "  gen       Generate TS + zod from openapi.yaml"
	@echo "  gen-ts    Generate TS types only"
	@echo "  gen-zod   Generate zod schemas + zodios client"
	@echo "  lint      Spectral lint openapi.yaml"
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
	rm -rf node_modules ../../component/protocol/generated
