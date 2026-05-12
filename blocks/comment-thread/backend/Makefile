.PHONY: help install db-up db-down db-reset migrate dev test lint seed-demo seed-reset clean

UV ?= uv
PY ?= 3.12

help:
	@echo "Targets:"
	@echo "  install      uv venv + install"
	@echo "  db-up        Start postgres on :5547"
	@echo "  db-down      Stop postgres"
	@echo "  db-reset     Drop + recreate + migrate"
	@echo "  migrate      alembic upgrade head"
	@echo "  dev          uvicorn :8083 reload"
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
	@until docker compose exec -T postgres pg_isready -U ct -d ct >/dev/null 2>&1; do sleep 1; done

db-down:
	docker compose down

db-reset:
	docker compose down -v
	$(MAKE) db-up
	$(MAKE) migrate

migrate: install
	$(UV) run alembic upgrade head

dev: install
	$(UV) run uvicorn app.main:app --host 0.0.0.0 --port 8083 --reload

test: install
	CT_AUTH_MODE=dev $(UV) run pytest -v --cov

lint: install
	$(UV) run ruff check . && $(UV) run ruff format --check .

seed-demo: install
	$(UV) run ct-seed demo

seed-reset: install
	$(UV) run ct-seed reset

clean:
	rm -rf .venv .pytest_cache .ruff_cache build dist *.egg-info
