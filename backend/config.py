"""
O2C Agent v2.0 — Application Configuration
Uses pydantic-settings for type-safe env var loading.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_url: str = "http://localhost:5173"
    log_level: str = "INFO"

    # PostgreSQL
    database_url: str = ""  # Full DSN takes priority when set (e.g. Neon cloud)
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "o2c_agent"
    postgres_user: str = "o2c_admin"
    postgres_password: str = "changeme"
    postgres_ssl: str = ""  # e.g. 'require' for cloud DBs like Neon

    @property
    def postgres_dsn(self) -> str:
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @property
    def asyncpg_dsn(self) -> str:
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""

    @property
    def redis_url(self) -> str:
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/0"
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    # ChromaDB
    chromadb_host: str = "localhost"
    chromadb_port: int = 8001
    chromadb_persist_path: str = "./chroma_data"

    # Groq
    groq_api_key: str = ""
    groq_model_primary: str = "llama-3.3-70b-versatile"
    groq_model_fallback: str = "llama-3.1-8b-instant"
    groq_max_rpm: int = 30

    # JWT
    jwt_secret_key: str = "change_this_in_production_minimum_32_chars"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    # Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_tls: bool = True
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@example.com"   # sender address; override via SMTP_FROM env var

    @property
    def email_from(self) -> str:
        """Alias — returns smtp_user if set (Gmail etc.), otherwise smtp_from."""
        return self.smtp_user or self.smtp_from


    # ML
    ml_models_path: str = "./ml/models"
    gliner_model: str = "urchade/gliner_medium-v2.1"
    embeddings_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Business Rules
    fraud_block_threshold: float = 0.70
    cash_app_auto_match_threshold: float = 0.90
    credit_limit_hitl_threshold: float = 0.90
    hitl_gate_sox_amount_inr: float = 50000.0
    dunning_max_contacts_per_week: int = 2

    # Inventory
    backorder_stale_days: int = 30          # days before an active backorder is flagged as stale
    default_safety_stock_buffer_pct: float = 0.20  # 20% buffer above reorder_level for safety_stock calc

    # Auto-Dunning Scheduler
    auto_dunning_interval_minutes: int = 60  # how often to scan overdue invoices


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
