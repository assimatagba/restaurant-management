from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import connection


def session(client, email='amadou@epicea.local', password='Manager2026!'):
    response = client.post('/api/auth/login', json={'email': email, 'password': password})
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


def booking(**changes):
    return {'table_ids': [1, 5], 'customer_name': 'Famille Ndiaye', 'party_size': 4,
            'reserved_at': '2035-06-01T12:00:00Z', 'notes': 'Une chaise bébé, merci.', **changes}


def test_reservation_lifecycle_updates_tables_and_markers():
    with TestClient(app) as client:
        headers = session(client)
        created = client.post('/api/reservations', headers=headers, json=booking())
        assert created.status_code == 201
        reservation_id = created.json()['id']
        tables = client.get('/api/tables', headers=headers).json()
        for table in tables:
            if table['id'] in (1, 5):
                assert table['status'] == 'reserved'
                assert table['reservations'][0]['notes'] == 'Une chaise bébé, merci.'
                assert table['reservations'][0]['party_size'] == 4
        available = client.get('/api/reservations/availability', params={'reserved_at': '2035-06-01T13:59:00Z'}, headers=headers).json()
        assert not {1, 5}.intersection(table['id'] for table in available['tables'])
        assert client.post('/api/reservations', headers=headers, json=booking()).status_code == 409
        adjacent = client.get('/api/reservations/availability', params={'reserved_at': '2035-06-01T14:00:00Z'}, headers=headers).json()
        assert {1, 5}.issubset(table['id'] for table in adjacent['tables'])
        assert client.post(f'/api/reservations/{reservation_id}/cancel', headers=headers).status_code == 200
        tables = client.get('/api/tables', headers=headers).json()
        for table in tables:
            if table['id'] in (1, 5):
                assert table['status'] == 'free'
                assert table['reservations'] == []


def test_reservation_validates_dates_capacity_and_selection():
    with TestClient(app) as client:
        headers = session(client)
        for payload in (booking(reserved_at='2020-01-01T12:00:00Z'), booking(table_ids=[]),
                        booking(table_ids=[1, 1]), booking(party_size=8), booking(customer_name='   '),
                        booking(reserved_at='invalid')):
            assert client.post('/api/reservations', headers=headers, json=payload).status_code == 422


def test_cancelling_one_slot_preserves_another_reservation():
    with TestClient(app) as client:
        headers = session(client)
        first = client.post('/api/reservations', headers=headers, json=booking()).json()
        second = client.post('/api/reservations', headers=headers, json=booking(reserved_at='2035-06-02T12:00:00Z')).json()
        client.post(f'/api/reservations/{first["id"]}/cancel', headers=headers)
        table = next(table for table in client.get('/api/tables', headers=headers).json() if table['id'] == 1)
        assert table['status'] == 'reserved'
        assert [item['id'] for item in table['reservations']] == [second['id']]


def test_concurrent_submissions_cannot_double_book():
    with TestClient(app) as client:
        headers = session(client)
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: client.post('/api/reservations', headers=headers, json=booking()).status_code, range(2)))
        assert sorted(results) == [201, 409]


def test_server_can_manage_reservations_and_anonymous_cannot():
    with TestClient(app) as client:
        assert client.post('/api/reservations', json=booking()).status_code == 401
        headers = session(client, 'mariam@epicea.local', 'Serveur2026!')
        created = client.post('/api/reservations', headers=headers, json=booking())
        assert created.status_code == 201
        assert client.post(f'/api/reservations/{created.json()["id"]}/cancel', headers=headers).status_code == 200


def test_cancellation_preserves_occupied_table():
    with TestClient(app) as client:
        headers = session(client)
        created = client.post('/api/reservations', headers=headers, json=booking(table_ids=[2], party_size=2)).json()
        client.post(f'/api/reservations/{created["id"]}/cancel', headers=headers)
        table = next(table for table in client.get('/api/tables', headers=headers).json() if table['id'] == 2)
        assert table['status'] == 'occupied'
        assert table['reservations'] == []


def test_expired_reservation_has_no_marker_or_reserved_status():
    with TestClient(app) as client:
        headers = session(client)
        with connection() as db:
            db.execute("INSERT INTO reservations(table_id,customer_name,contact,reserved_at,party_size,created_by) VALUES (1,'Ancien client','','2020-01-01T12:00:00Z',2,'Test')")
            db.execute("UPDATE restaurant_tables SET status='reserved' WHERE id=1")
        table = next(table for table in client.get('/api/tables', headers=headers).json() if table['id'] == 1)
        assert table['status'] == 'free'
        assert table['reservations'] == []


def test_reservation_keeps_physical_tables_blocked_after_unmerge():
    with TestClient(app) as client:
        headers = session(client)
        merged = client.post('/api/tables/merge', headers=headers, json={'table_ids': [1, 5], 'target_table_id': 1})
        assert merged.status_code == 200
        assert client.post('/api/reservations', headers=headers, json=booking(table_ids=[1])).status_code == 201
        assert client.post('/api/tables/1/unmerge', headers=headers).status_code == 200
        assert client.post('/api/reservations', headers=headers, json=booking(table_ids=[5], party_size=2)).status_code == 409
