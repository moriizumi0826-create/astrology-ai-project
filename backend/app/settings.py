import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DEFAULT_PUBLIC_CORS_ORIGINS = "https://moriizumi0826-create.github.io"


@dataclass
class Settings:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1")
    geocoding_base_url: str = os.getenv(
        "GEOCODING_BASE_URL", "https://geocoding-api.open-meteo.com/v1/search"
    )
    api_cors_origins: list[str] = None

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
