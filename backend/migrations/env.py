from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401  (registers tables on Base.metadata)
from app.core.config import get_settings
from app.core.database import Base

config = context.config
# configparser treats % as interpolation, so escape it
config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
target_metadata = Base.metadata


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
