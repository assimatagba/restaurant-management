from fastapi.testclient import TestClient
from backend.app import database
from backend.app.main import app


def test_leave_request_lifecycle_and_validation(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATABASE_PATH', tmp_path / 'restaurant.db')
    with TestClient(app) as client:
        # Seeded servers must be linked to their employee record after migration.
        database.initialize_database()
        def login(email, password):
            response = client.post('/api/auth/login', json={'email': email, 'password': password})
            assert response.status_code == 200
            return {'Authorization': 'Bearer ' + response.json()['access_token']}
        server = login('mariam@epicea.local', 'Serveur2026!')
        manager = login('amadou@epicea.local', 'Manager2026!')
        payload = {'start_date': '2027-03-01', 'end_date': '2027-03-03', 'reason': 'Congé annuel'}
        for invalid in ({'start_date': '2027-02-30'}, {'end_date': '2027-02-28'}, {'reason': '   '}):
            assert client.post('/api/leave-requests', headers=server, json={**payload, **invalid}).status_code == 422
        created = client.post('/api/leave-requests', headers=server, json=payload)
        assert created.status_code == 201, created.text
        request_id = created.json()['id']
        assert client.post('/api/leave-requests', headers=server, json=payload).status_code == 409
        assert any(r['id'] == request_id for r in client.get('/api/leave-requests', headers=manager).json())
        assert client.patch(f'/api/leave-requests/{request_id}', headers=server, json={'status': 'approved'}).status_code == 403
        assert client.patch(f'/api/leave-requests/{request_id}', headers=manager, json={'status': 'approved'}).status_code == 200
        assert client.patch(f'/api/leave-requests/{request_id}', headers=manager, json={'status': 'rejected'}).status_code == 409
        mine = client.get('/api/leave-requests/mine', headers=server).json()
        assert next(r for r in mine if r['id'] == request_id)['status'] == 'approved'
        assert all(r['id'] != request_id for r in client.get('/api/leave-requests/mine', headers=manager).json())
