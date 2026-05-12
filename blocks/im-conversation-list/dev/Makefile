.PHONY: help dev test backend-% frontend-%

help:
	@echo "Top-level orchestration. Most work happens inside backend/ or frontend/."
	@echo "Targets:"
	@echo "  dev            Start all dev services (currently: backend only)"
	@echo "  test           Run all tests"
	@echo "  backend-<tgt>  Forward <tgt> to backend/Makefile (e.g. backend-dev)"

dev:
	$(MAKE) -C backend dev

test:
	$(MAKE) -C backend test

backend-%:
	$(MAKE) -C backend $*

frontend-%:
	@echo "Frontend not yet scaffolded."
	@exit 1
