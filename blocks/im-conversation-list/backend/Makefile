.PHONY: help install db-up db-down db-reset migrate dev test lint type seed-demo seed-bench seed-reset clean

UV ?= uv
PY ?= 3.12

help:
	@echo "Targets:"
	@echo "  install      Create venv via uv and install deps"
	@echo "  db-up        Start postgres via docker compose"
	@echo "  db-down      Stop postgres"
	@echo "  db-reset     Drop & recreate dev + test databases"
	@echo "  migrate      Run alembic upgrade head"
	@echo "  dev          Run uvicorn with reload"
	@echo "  test         Run pytest against test DB"
	@echo "  lint         Run ruff"
	@echo "  type         Run mypy"
	@echo "  seed-demo    Seed dev DB with demo data"
	@echo "  seed-bench   Seed dev DB with benchmark data"
	@echo "  seed-reset   Truncate seed data"
	@echo "  clean        Remove venv and caches"

.venv: pyproject.toml
	$(UV) venv --python $(PY) .venv
	$(UV) pip install -e '.[dev]'
	@touch .venv

install: .venv

db-up:
	docker compose up -d postgres
	@echo "Waiting for postgres..."
	@until docker compose exec -T postgres pg_isready -U imcl -d imcl >/dev/null 2>&1; do sleep 1; done
	@echo "Postgres ready on localhost:5544"

db-down:
	docker compose down

db-reset:
	docker compose down -v
	$(MAKE) db-up
	$(MAKE) migrate

migrate: install
	$(UV) run alembic upgrade head

dev: install
	$(UV) run uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

test: install
	IMCL_AUTH_MODE=dev $(UV) run pytest -v --cov

lint: install
	$(UV) run ruff check . && $(UV) run ruff format --check .

type: install
	$(UV) run mypy app

seed-demo: install
	$(UV) run imcl-seed demo

seed-bench: install
	$(UV) run imcl-seed bench

seed-reset: install
	$(UV) run imcl-seed reset

clean:
	rm -rf .venv .pytest_cache .mypy_cache .ruff_cache build dist *.egg-info
