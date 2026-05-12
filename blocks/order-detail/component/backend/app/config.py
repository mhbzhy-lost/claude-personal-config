from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="OD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://od:od@localhost:5546/od"
    database_url_test: str = "postgresql+asyncpg://od:od@localhost:5546/od_test"

    auth_mode: Literal["dev", "jwt"] = "dev"
    jwt_public_key: SecretStr | None = None
    jwt_algorithm: str = "RS256"
    jwt_audience: str | None = None
    jwt_issuer: str | None = None

    host: str = "0.0.0.0"
    port: int = 8082
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    default_page_size: int = Field(default=20, gt=0, le=100)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def get_settings() -> Settings:
    return Settings()
