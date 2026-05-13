.PHONY: help install db-up db-down db-reset migrate dev test lint seed-demo seed-reset clean

UV ?= uv
PY ?= 3.12

# Runtime artifacts (pyproject.toml / app / alembic) live in component/backend.
# All uv/alembic/pytest invocations cd in there so pyproject.toml is the cwd.
COMPONENT := $(CURDIR)/../../component/backend

help:
	@echo "Targets:"
	@echo "  install      uv venv + install"
	@echo "  db-up        Start postgres on :5551"
	@echo "  db-down      Stop postgres"
	@echo "  db-reset     Drop + recreate + migrate"
	@echo "  migrate      alembic upgrade head"
	@echo "  dev          uvicorn :8087 reload"
	@echo "  test         pytest"
	@echo "  seed-demo    populate demo data"
	@echo "  seed-reset   truncate seed data"

$(COMPONENT)/.venv: $(COMPONENT)/pyproject.toml
	cd $(COMPONENT) && $(UV) venv --python $(PY) .venv
	cd $(COMPONENT) && $(UV) pip install -e '.[dev]'
	@touch $(COMPONENT)/.venv

install: $(COMPONENT)/.venv

db-up:
	docker compose up -d postgres
	@until docker compose exec -T postgres pg_isready -U up -d up >/dev/null 2>&1; do sleep 1; done

db-down:
	docker compose down

db-reset:
	docker compose down -v
	$(MAKE) db-up
	$(MAKE) migrate

migrate: install
	cd $(COMPONENT) && $(UV) run alembic upgrade head

dev: install
	cd $(COMPONENT) && $(UV) run uvicorn app.main:app --host 0.0.0.0 --port 8087 --reload

test: install
	cd $(COMPONENT) && UP_AUTH_MODE=dev $(UV) run pytest -v --cov --rootdir=$(CURDIR) $(CURDIR)/tests

lint: install
	cd $(COMPONENT) && $(UV) run ruff check . && $(UV) run ruff format --check .

seed-demo: install
	cd $(COMPONENT) && $(UV) run up-seed demo

seed-reset: install
	cd $(COMPONENT) && $(UV) run up-seed reset

clean:
	rm -rf $(COMPONENT)/.venv $(COMPONENT)/.pytest_cache $(COMPONENT)/.ruff_cache $(COMPONENT)/build $(COMPONENT)/dist $(COMPONENT)/*.egg-info
