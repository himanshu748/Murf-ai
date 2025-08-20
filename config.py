import os
from functools import lru_cache
from typing import Optional
from dotenv import load_dotenv


load_dotenv()


class Settings:
    """Application configuration loaded from environment variables."""

    # Third-party API Keys
    MURF_API_KEY: Optional[str] = os.getenv("MURF_API_KEY")
    ASSEMBLYAI_API_KEY: Optional[str] = os.getenv("ASSEMBLYAI_API_KEY")
    PERPLEXITY_API_KEY: Optional[str] = os.getenv("PERPLEXITY_API_KEY")

    # LLM
    PERPLEXITY_MODEL: str = os.getenv("PERPLEXITY_MODEL", "sonar")

    # App
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    MAX_CHAT_HISTORY: int = int(os.getenv("MAX_CHAT_HISTORY", "10"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
