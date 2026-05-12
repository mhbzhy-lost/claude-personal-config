from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="{{ENV_PREFIX}}_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://{{ENV_PREFIX_LOWER}}:{{ENV_PREFIX_LOWER}}@localhost:{{POSTGRES_PORT}}/{{ENV_PREFIX_LOWER}}"
    database_url_test: str = "postgresql+asyncpg://{{ENV_PREFIX_LOWER}}:{{ENV_PREFIX_LOWER}}@localhost:{{POSTGRES_PORT}}/{{ENV_PREFIX_LOWER}}_test"

    auth_mode: Literal["dev", "jwt"] = "dev"
    jwt_public_key: SecretStr | None = None
    jwt_algorithm: str = "RS256"
    jwt_audience: str | None = None
    jwt_issuer: str | None = None

    host: str = "0.0.0.0"
    port: int = {{BACKEND_PORT}}
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    default_page_size: int = Field(default=20, gt=0, le=100)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def get_settings() -> Settings:
    return Settings()
