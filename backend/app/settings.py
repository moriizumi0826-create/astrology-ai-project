import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv, dotenv_values


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DEFAULT_PUBLIC_CORS_ORIGINS = "https://moriizumi0826-create.github.io"


@dataclass
class Settings:
    money_ai_api_key: str = field(default_factory=lambda: os.getenv("MONEY_AI_API_KEY", ""), repr=False)
    money_ai_model: str = os.getenv("MONEY_AI_MODEL", "gpt-6.1-sol")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1")
    geocoding_base_url: str = os.getenv(
        "GEOCODING_BASE_URL", "https://geocoding-api.open-meteo.com/v1/search"
    )
    api_cors_origins: list[str] = None

    def money_ai_config(self) -> tuple[str, str]:
        path = PROJECT_ROOT / '.env.money-ai'
        if path.is_file():
            values = dotenv_values(path)
            return values.get('MONEY_AI_API_KEY') or '', values.get('MONEY_AI_MODEL') or self.money_ai_model
        return self.money_ai_api_key, self.money_ai_model

    def __post_init__(self) -> None:
        origins = os.getenv(
            "API_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
        )
        public_origins = os.getenv("API_PUBLIC_CORS_ORIGINS", DEFAULT_PUBLIC_CORS_ORIGINS)
        self.api_cors_origins = list(
            dict.fromkeys(
                item.strip()
                for item in f"{origins},{public_origins}".split(",")
                if item.strip()
            )
        )


settings = Settings()
