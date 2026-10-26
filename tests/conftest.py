"""Every backend test uses a fresh database, never data/restaurant.db."""
import pytest
from backend.app import database


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATABASE_PATH', tmp_path / 'restaurant.db')
