from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openroute_api_key: str = ""
    nominatim_user_agent: str = "MAPIP-Routing-Service/1.0 (university project)"


settings = Settings()
