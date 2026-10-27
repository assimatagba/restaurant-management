from datetime import datetime, timezone

import pytest
from backend.app import database
from backend.app.analytics import dashboard_data


@pytest.fixture
def metrics_db(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATABASE_PATH', tmp_path / 'metrics.db')
    database.initialize_database()
    with database.connection() as db:
        for table in ('payments', 'order_lines', 'orders', 'service_sessions', 'cash_register_sessions', 'leave_requests'):
            db.execute(f'DELETE FROM {table}')
        yield db


def test_daily_metrics_use_actual_orders_and_partial_payments(metrics_db):
    db = metrics_db
    now = datetime(2027, 1, 2, 12, tzinfo=timezone.utc)
    values = [('today-a', 'received', 30, '2027-01-02 11:50:00'),
              ('today-b', 'served', 50, '2027-01-02 10:00:00'),
              ('cancelled', 'cancelled', 1000, '2027-01-02 10:00:00'),
              ('previous', 'served', 20, '2027-01-01 10:00:00')]
    for number, status, total, date in values:
        db.execute('INSERT INTO orders(public_number,order_type,status,total,created_at) VALUES (?,\'takeaway\',?,?,?)', (number, status, total, date))
    db.execute("INSERT INTO payments(order_id,amount,method,cashier_name,paid_at) VALUES (1,10,'cash','Test','2027-01-02 10:00:00')")
    db.execute("INSERT INTO payments(order_id,amount,method,cashier_name,paid_at) VALUES (1,5,'cash','Test','2027-01-02 11:00:00')")
    db.execute("INSERT INTO payments(order_id,amount,method,cashier_name,paid_at) VALUES (1,10,'cash','Test','2027-01-01 11:00:00')")
    result = dashboard_data(db, now)
    assert result['revenue'] == 15
    assert result['orders'] == 2
    assert result['average_basket'] == 40
    assert result['changes'] == {'revenue': 50, 'orders': 100, 'average_basket': 100}
    assert sum(point['orders'] for point in result['order_flow']) == 2
    assert result['average_wait_minutes'] == 10
    assert result['service'] is None


def test_empty_day_and_zero_comparison_are_explicit(metrics_db):
    result = dashboard_data(metrics_db, datetime(2027, 1, 3, tzinfo=timezone.utc))
    assert result['revenue'] == 0
    assert result['orders'] == 0
    assert result['average_basket'] is None
    assert result['average_wait_minutes'] is None
    assert all(value is None for value in result['changes'].values())
    assert all(point['orders'] == 0 for point in result['order_flow'])


def test_only_today_open_service_is_reported(metrics_db):
    db = metrics_db
    db.execute("INSERT INTO service_sessions(service_date,service_type,manager_name) VALUES ('2027-01-01','lunch','Old manager')")
    assert dashboard_data(db, datetime(2027, 1, 2, tzinfo=timezone.utc))['service'] is None
    db.execute("INSERT INTO service_sessions(service_date,service_type,manager_name) VALUES ('2027-01-02','dinner','Current manager')")
    assert dashboard_data(db, datetime(2027, 1, 2, tzinfo=timezone.utc))['service']['manager_name'] == 'Current manager'
