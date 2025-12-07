from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///app.db"
    debug: bool = True
    api_prefix: str = "/api"
    cors_origins: list[str] = [
        "http://localhost:5173", 
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
    ]
    
    # Gemini API
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"  # For everything  
    gemini_model_synthesis: str = "gemini-2.5-flash"  # For synthesis
    
    # Serper API (Google Search) - get free key at https://serper.dev
    serper_api_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
