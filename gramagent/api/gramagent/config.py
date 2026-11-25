from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='GRAM_', env_file='.env', extra='ignore')
    environment: str = 'development'
    data_dir: Path = Path('.gramagent')
    mongo_uri: str = ''
    mongo_database: str = 'gramagent'
    jwt_secret: str = ''
    frontend_origin: str = 'http://localhost:5174'
    model_provider: str = 'none'
    model_name: str = ''
    bootstrap_email: str = ''
    bootstrap_password: str = ''
    village360_url: str = ''
    village360_token: str = ''
    village360_mongo_uri: str = ''
    village360_database: str = 'village360'
    vector_index: str = ''
    embedding_model: str = ''
    retention_days: int = 365

settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
if not settings.jwt_secret:
    if settings.environment == 'production':
        raise RuntimeError('GRAM_JWT_SECRET is required in production')
    import secrets
    secret_file = settings.data_dir / 'jwt-secret'
    if not secret_file.exists():
        secret_file.write_text(secrets.token_hex(48))
        secret_file.chmod(0o600)
    settings.jwt_secret = secret_file.read_text().strip()
if len(settings.jwt_secret) < 32:
    raise RuntimeError('JWT secret must contain at least 32 characters')
if settings.environment == 'production' and not settings.mongo_uri:
    raise RuntimeError('Production requires a dedicated MongoDB database')
