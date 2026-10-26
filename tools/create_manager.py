"""Provision the requested local manager without storing a clear-text password."""
import secrets
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import connection, write_audit


if __name__ == '__main__':
    with TestClient(app) as client:
        email = 'manager@epicea.local'
        with connection() as db:
            existing = db.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()
        if existing:
            raise SystemExit('Account already exists; no credentials were overwritten.')
        login = client.post('/api/auth/login', json={'email': 'admin@epicea.local', 'password': 'Admin2026!'})
        login.raise_for_status()
        headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
        password = secrets.token_urlsafe(18) + '!9aA'
        with connection() as db:
            employee_id = db.execute("INSERT INTO employees(name,role,contract_type,hire_date,email) VALUES ('Manager Épicéa','Manager','CDI',date('now'),?)", (email,)).lastrowid
        response = client.post('/api/users', headers=headers, json={'email': email, 'display_name': 'Manager Épicéa', 'password': password, 'role': 'manager', 'is_super_admin': True, 'employee_id': employee_id})
        response.raise_for_status()
        verification = client.post('/api/auth/login', json={'email': email, 'password': password})
        verification.raise_for_status()
        assert verification.json()['user']['is_super_admin'] is True
        assert verification.json()['user']['role'] == 'manager'
        assert client.get('/api/users', headers={'Authorization': 'Bearer ' + verification.json()['access_token']}).status_code == 200
        print('Email:', email)
        print('Password:', password)
        print('Verified: manager, super administrator, access to user administration.')
