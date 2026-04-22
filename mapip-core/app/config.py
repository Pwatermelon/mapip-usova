from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:12345@localhost:5432/map"
    session_secret: str = "change-me-in-production-use-long-random-string"


settings = Settings()
