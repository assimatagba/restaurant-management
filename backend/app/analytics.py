"""Measured restaurant indicators; daily boundaries follow Dakar (UTC)."""
from datetime import datetime, timedelta, timezone


def dashboard_data(db, now=None):
    now = now or datetime.now(timezone.utc)
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()

    def day_metrics(day):
        orders = db.execute("SELECT COUNT(*), AVG(total) FROM orders WHERE date(created_at)=? AND status!='cancelled'", (day,)).fetchone()
        revenue = db.execute('SELECT COALESCE(SUM(amount),0) FROM payments WHERE date(paid_at)=?', (day,)).fetchone()[0]
        return {'revenue': round(revenue, 2), 'orders': orders[0], 'average_basket': round(orders[1], 2) if orders[1] is not None else None}

    metrics, previous = day_metrics(today), day_metrics(yesterday)
    changes = {key: round((metrics[key] - previous[key]) / previous[key] * 100, 1)
               if previous[key] and metrics[key] is not None else None for key in metrics}
    active = db.execute("SELECT COUNT(*) FROM orders WHERE status IN ('received','preparing','ready')").fetchone()[0]
    kitchen = db.execute("SELECT COUNT(*) FROM orders WHERE status IN ('received','preparing')").fetchone()[0]
    waiting = db.execute("SELECT AVG(MAX(0, (julianday(?) - julianday(created_at))*1440)) FROM orders WHERE status IN ('received','preparing')", (now.isoformat(),)).fetchone()[0]
    rule = db.execute('SELECT estimated_minutes FROM wait_time_rules WHERE min_orders<=? AND max_orders>=? ORDER BY min_orders DESC, id DESC LIMIT 1', (kitchen, kitchen)).fetchone()
    by_hour = {int(row[0]): row[1] for row in db.execute("SELECT strftime('%H',created_at), COUNT(*) FROM orders WHERE date(created_at)=? AND status!='cancelled' GROUP BY 1", (today,))}
    service = db.execute("SELECT * FROM service_sessions WHERE service_date=? AND status='open' ORDER BY opened_at DESC,id DESC LIMIT 1", (today,)).fetchone()
    cash = db.execute("SELECT * FROM cash_register_sessions WHERE date(opened_at)=? AND status='open' ORDER BY id DESC LIMIT 1", (today,)).fetchone()
    pending = db.execute("SELECT COUNT(*) FROM leave_requests WHERE status='pending'").fetchone()[0]
    return {**metrics, 'date': today, 'timezone': 'Africa/Dakar', 'changes': changes,
            'active_orders': active, 'kitchen_orders': kitchen, 'open_leave_requests': pending,
            'leave_requests': pending, 'average_wait_minutes': round(waiting, 1) if waiting is not None else None,
            'estimated_minutes': rule[0] if rule else None,
            'order_flow': [{'hour': hour, 'orders': by_hour.get(hour, 0)} for hour in range(24)],
            'service': dict(service) if service else None, 'cash_register': dict(cash) if cash else None}
