import sqlite3

import pytest
from backend.app import database


def test_connection_commits_and_closes_after_success(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATABASE_PATH', tmp_path / 'database.db')
    with database.connection() as db:
        db.execute('CREATE TABLE example (value TEXT)')
        db.execute("INSERT INTO example VALUES ('saved')")
    with pytest.raises(sqlite3.ProgrammingError, match='closed'):
        db.execute('SELECT 1')
    with database.connection() as reopened:
        assert reopened.execute('SELECT value FROM example').fetchone()['value'] == 'saved'


def test_connection_rolls_back_and_closes_after_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATABASE_PATH', tmp_path / 'database.db')
    with database.connection() as db:
        db.execute('CREATE TABLE example (value TEXT)')
    with pytest.raises(ValueError, match='abort'):
        with database.connection() as failed:
            failed.execute("INSERT INTO example VALUES ('discarded')")
            raise ValueError('abort')
    with pytest.raises(sqlite3.ProgrammingError, match='closed'):
        failed.execute('SELECT 1')
    with database.connection() as reopened:
        assert reopened.execute('SELECT COUNT(*) FROM example').fetchone()[0] == 0
