.PHONY: help install db-up db-down db-reset migrate dev test lint seed-demo seed-reset clean

UV ?= uv
PY ?= 3.12

help:
	@echo "Targets:"
	@echo "  install      uv venv + install"
	@echo "  db-up        Start postgres on :{{POSTGRES_PORT}}"
	@echo "  db-down      Stop postgres"
	@echo "  db-reset     Drop + recreate + migrate"
	@echo "  migrate      alembic upgrade head"
	@echo "  dev          uvicorn :{{BACKEND_PORT}} reload"
	@echo "  test         pytest"
	@echo "  seed-demo    populate demo data"
	@echo "  seed-reset   truncate seed data"

.venv: pyproject.toml
	$(UV) venv --python $(PY) .venv
	$(UV) pip install -e '.[dev]'
	@touch .venv

install: .venv

db-up:
	docker compose up -d postgres
	@until docker compose exec -T postgres pg_isready -U {{ENV_PREFIX_LOWER}} -d {{ENV_PREFIX_LOWER}} >/dev/null 2>&1; do sleep 1; done

db-down:
	docker compose down

db-reset:
	docker compose down -v
	$(MAKE) db-up
	$(MAKE) migrate

migrate: install
	$(UV) run alembic upgrade head

dev: install
	$(UV) run uvicorn app.main:app --host 0.0.0.0 --port {{BACKEND_PORT}} --reload

test: install
	{{ENV_PREFIX}}_AUTH_MODE=dev $(UV) run pytest -v --cov

lint: install
	$(UV) run ruff check . && $(UV) run ruff format --check .

seed-demo: install
	$(UV) run {{SEED_CMD}} demo

seed-reset: install
	$(UV) run {{SEED_CMD}} reset

clean:
	rm -rf .venv .pytest_cache .ruff_cache build dist *.egg-info
