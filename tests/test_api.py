from fastapi.testclient import TestClient
from backend.app.database import connection
from backend.app.main import app


def test_healthcheck():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_frontend_routes_and_entry_assets_are_served():
    import re
    with TestClient(app) as client:
        for route in ('/', '/back-office/', '/front-office/'):
            response = client.get(route)
            assert response.status_code == 200
            assets = re.findall(r'<script[^>]+src="([^"]+)"', response.text)
            assert assets, f'No application entry point in {route}'
            for asset in assets:
                assert client.get(asset).status_code == 200


def test_menu_is_available():
    with TestClient(app) as client:
        response = client.get("/api/menu?available_only=true")
    assert response.status_code == 200
    assert len(response.json()) >= 1


def test_unchanged_snapshot_returns_only_the_version():
    with TestClient(app) as client:
        login = client.post('/api/auth/login', json={'email': 'mariam@epicea.local', 'password': 'Serveur2026!'})
        headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
        snapshot = client.get('/api/back-office/snapshot', headers=headers).json()
        unchanged = client.get('/api/back-office/snapshot', params={'since': snapshot['version']}, headers=headers)
        assert unchanged.status_code == 200
        assert unchanged.json() == {'version': snapshot['version'], 'unchanged': True}


def test_kitchen_count_excludes_ready_served_and_cancelled_orders():
    with TestClient(app) as client:
        login = client.post('/api/auth/login', json={'email': 'amadou@epicea.local', 'password': 'Manager2026!'})
        headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
        baseline = client.get('/api/dashboard', headers=headers).json()['kitchen_orders']
        with connection() as db:
            for index, status in enumerate(('received', 'preparing', 'ready', 'served', 'cancelled')):
                db.execute('INSERT INTO orders(public_number, order_type, status, payment_status) VALUES (?, ?, ?, ?)',
                           (f'dashboard-count-{index}', 'takeaway', status, 'paid' if status == 'preparing' else 'unpaid'))
        dashboard = client.get('/api/dashboard', headers=headers).json()
        snapshot = client.get('/api/back-office/snapshot', headers=headers).json()
        assert dashboard['kitchen_orders'] == baseline + 2
        assert snapshot['dashboard']['kitchen_orders'] == baseline + 2


def test_order_creation_requires_auth():
    with TestClient(app) as client:
        response = client.post(
            "/api/orders",
            json={
                "order_type": "dine_in",
                "table_id": 5,
                "lines": [{"menu_item_id": 1, "quantity": 1}],
            },
        )
    assert response.status_code == 401


def test_public_server_call_option_is_removed():
    with TestClient(app) as client:
        response = client.post(
            "/api/server-calls",
            json={"table_id": 1, "request_type": "assistance"},
        )
    assert response.status_code == 405


def test_server_can_only_mark_ready_orders_as_served():
    with TestClient(app) as client:
        login = client.post(
            "/api/auth/login",
            json={"email": "amadou@epicea.local", "password": "Manager2026!"},
        )
        manager_token = login.json()["access_token"]

        created = client.post(
            "/api/orders",
            json={
                "order_type": "dine_in",
                "table_id": 1,
                "notes": "Sans sel et bien cuit",
                "lines": [{"menu_item_id": 1, "quantity": 1, "notes": "Sans sel"}],
            },
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert created.status_code == 201
        order_id = created.json()["id"]

        server_login = client.post(
            "/api/auth/login",
            json={"email": "mariam@epicea.local", "password": "Serveur2026!"},
        )
        server_token = server_login.json()["access_token"]

        response = client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "preparing"},
            headers={"Authorization": f"Bearer {server_token}"},
        )
        assert response.status_code == 403

        response = client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "ready"},
            headers={"Authorization": f"Bearer {server_token}"},
        )
        assert response.status_code == 403

        kitchen_response = client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "ready"},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert kitchen_response.status_code == 200

        response = client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "served"},
            headers={"Authorization": f"Bearer {server_token}"},
        )
        served_snapshot = client.get(
            "/api/back-office/snapshot",
            headers={"Authorization": f"Bearer {server_token}"},
        )
        assert any(order["id"] == order_id for order in served_snapshot.json()["order_history"])

        cancelled = client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "cancelled"},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert cancelled.status_code == 200
        cancelled_snapshot = client.get(
            "/api/back-office/snapshot",
            headers={"Authorization": f"Bearer {server_token}"},
        )
        archived_order = next(order for order in cancelled_snapshot.json()["order_history"] if order["id"] == order_id)
        assert archived_order["status"] == "cancelled"

    assert response.status_code == 200
    assert response.json()["status"] == "served"


def test_server_can_release_table_only_after_order_is_paid():
    with TestClient(app) as client:
        manager_login = client.post(
            "/api/auth/login",
            json={"email": "amadou@epicea.local", "password": "Manager2026!"},
        )
        manager_token = manager_login.json()["access_token"]
        server_login = client.post(
            "/api/auth/login",
            json={"email": "mariam@epicea.local", "password": "Serveur2026!"},
        )
        server_token = server_login.json()["access_token"]

        created = client.post(
            "/api/orders",
            json={
                "order_type": "dine_in",
                "table_id": 5,
                "lines": [{"menu_item_id": 1, "quantity": 1}],
            },
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        order_id = created.json()["id"]

        blocked = client.patch(
            "/api/tables/5/status",
            json={"status": "free"},
            headers={"Authorization": f"Bearer {server_token}"},
        )
        assert blocked.status_code == 409

        paid = client.post(
            f"/api/orders/{order_id}/payments",
            json={"amount": 14, "method": "cash"},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert paid.status_code == 201

        released = client.patch(
            "/api/tables/5/status",
            json={"status": "free"},
            headers={"Authorization": f"Bearer {server_token}"},
        )

    assert released.status_code == 200
    assert released.json()["status"] == "free"


def test_manager_can_create_tables_with_automatic_numbers():
    created_ids = []
    table_numbers = []
    with TestClient(app) as client:
        login = client.post(
            "/api/auth/login",
            json={"email": "amadou@epicea.local", "password": "Manager2026!"},
        )
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        tables = client.get("/api/tables", headers=headers).json()
        first_number = max(table["number"] for table in tables) + 1
        try:
            for capacity in (6, 2):
                response = client.post("/api/tables", json={"capacity": capacity}, headers=headers)
                assert response.status_code == 201
                table = response.json()
                created_ids.append(table["id"])
                table_numbers.append(table["number"])
                assert table["capacity"] == capacity
                assert table["status"] == "free"
            assert table_numbers == [first_number, first_number + 1]
        finally:
            if created_ids:
                with connection() as db:
                    db.executemany("DELETE FROM restaurant_tables WHERE id=?", [(table_id,) for table_id in created_ids])
                    db.executemany(
                        "DELETE FROM audit_logs WHERE action='CREATE_TABLE' AND target=?",
                        [(f"table:{number}",) for number in table_numbers],
                    )


def test_manager_can_merge_multiple_tables_into_selected_target():
    created_ids = []
    table_numbers = []
    merge_ids = []
    with TestClient(app) as client:
        login = client.post(
            "/api/auth/login",
            json={"email": "amadou@epicea.local", "password": "Manager2026!"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        try:
            for _ in range(3):
                created = client.post("/api/tables", json={"capacity": 2}, headers=headers)
                assert created.status_code == 201
                table = created.json()
                created_ids.append(table["id"])
                table_numbers.append(table["number"])

            target_id = created_ids[2]
            merged = client.post(
                "/api/tables/merge",
                json={"table_ids": created_ids, "target_table_id": target_id},
                headers=headers,
            )
            assert merged.status_code == 200
            result = merged.json()
            merge_ids = result["merge_ids"]
            assert result["target_table_id"] == target_id
            assert result["source_table_ids"] == created_ids[:2]

            tables = {table["id"]: table for table in client.get("/api/tables", headers=headers).json()}
            assert tables[target_id]["status"] == "free"
            assert tables[target_id]["capacity"] == 6
            assert tables[target_id]["display_number"] == " + ".join(map(str, reversed(table_numbers)))
            assert created_ids[0] not in tables
            assert created_ids[1] not in tables
        finally:
            with connection() as db:
                db.executemany("DELETE FROM table_merges WHERE id=?", [(merge_id,) for merge_id in merge_ids])
                db.executemany("DELETE FROM restaurant_tables WHERE id=?", [(table_id,) for table_id in created_ids])
                audit_targets = [f"table:{number}" for number in table_numbers]
                audit_targets.extend(f"merge:{merge_id}" for merge_id in merge_ids)
                db.executemany("DELETE FROM audit_logs WHERE target=?", [(target,) for target in audit_targets])


def test_merge_sums_capacity_hides_source_and_keeps_highest_table_server():
    created_ids = []
    created_numbers = []
    merge_ids = []
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "amadou@epicea.local", "password": "Manager2026!"})
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        try:
            for capacity in (4, 2):
                created = client.post("/api/tables", json={"capacity": capacity}, headers=headers)
                assert created.status_code == 201
                created_ids.append(created.json()["id"])
                created_numbers.append(created.json()["number"])

            assigned = client.patch(
                f"/api/tables/{created_ids[1]}/assignment",
                json={"server_name": "Mariam Sarr"},
                headers=headers,
            )
            assert assigned.status_code == 200

            merged = client.post(
                "/api/tables/merge",
                json={"table_ids": created_ids, "target_table_id": created_ids[0]},
                headers=headers,
            )
            assert merged.status_code == 200
            result = merged.json()
            merge_ids = result["merge_ids"]
            assert result["table"]["capacity"] == 6
            assert result["table"]["server_name"] == "Mariam Sarr"
            assert result["table"]["display_number"] == " + ".join(map(str, reversed(created_numbers)))

            visible_tables = {table["id"]: table for table in client.get("/api/tables", headers=headers).json()}
            assert created_ids[0] in visible_tables
            assert created_ids[1] not in visible_tables
        finally:
            with connection() as db:
                db.executemany("DELETE FROM table_merges WHERE id=?", [(merge_id,) for merge_id in merge_ids])
                db.executemany("DELETE FROM restaurant_tables WHERE id=?", [(table_id,) for table_id in created_ids])
                db.executemany("DELETE FROM audit_logs WHERE target LIKE ?", [(f"table:{table_id}",) for table_id in created_ids])
                db.executemany("DELETE FROM audit_logs WHERE target=?", [(f"merge:{merge_id}",) for merge_id in merge_ids])


def test_unmerge_restores_source_table_and_previous_assignments():
    created_ids = []
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "amadou@epicea.local", "password": "Manager2026!"})
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        try:
            for capacity in (2, 4):
                response = client.post("/api/tables", json={"capacity": capacity}, headers=headers)
                assert response.status_code == 201
                created_ids.append(response.json()["id"])

            client.patch(f"/api/tables/{created_ids[0]}/assignment", json={"server_name": "Amadou Diallo"}, headers=headers)
            client.patch(f"/api/tables/{created_ids[1]}/assignment", json={"server_name": "Mariam Sarr"}, headers=headers)
            merged = client.post("/api/tables/merge", json={"table_ids": created_ids, "target_table_id": created_ids[0]}, headers=headers)
            assert merged.status_code == 200

            split = client.post(f"/api/tables/{created_ids[0]}/unmerge", headers=headers)
            assert split.status_code == 200
            tables = {table["id"]: table for table in split.json()["tables"]}
            assert tables[created_ids[0]]["capacity"] == 2
            assert tables[created_ids[0]]["server_name"] == "Amadou Diallo"
            assert tables[created_ids[1]]["capacity"] == 4
            assert tables[created_ids[1]]["server_name"] == "Mariam Sarr"
        finally:
            with connection() as db:
                db.execute("DELETE FROM table_merges WHERE source_table_id IN (?, ?)", created_ids)
                db.executemany("DELETE FROM restaurant_tables WHERE id=?", [(table_id,) for table_id in created_ids])
                db.executemany("DELETE FROM audit_logs WHERE target LIKE ?", [(f"table:{table_id}",) for table_id in created_ids])
