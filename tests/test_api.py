from fastapi.testclient import TestClient
from backend.app.main import app


def test_healthcheck():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_menu_is_available():
    with TestClient(app) as client:
        response = client.get("/api/menu?available_only=true")
    assert response.status_code == 200
    assert len(response.json()) >= 1