"""Reservation scheduling on UTC/Dakar two-hour slots."""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

SLOT_MINUTES = 120


def utc_time(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def validate_start(value):
    value = utc_time(value)
    if value <= datetime.now(timezone.utc):
        raise HTTPException(422, 'La réservation doit être dans le futur (heure de Dakar).')
    return value


def reservation_records(db, active_only=True):
    where = "WHERE r.status='confirmed' AND julianday(r.reserved_at) + r.duration_minutes/1440.0 > julianday('now')" if active_only else ''
    records = []
    for row in db.execute(f'SELECT r.* FROM reservations r {where} ORDER BY julianday(r.reserved_at),r.id').fetchall():
        item = dict(row)
        tables = db.execute('SELECT t.id,t.number FROM restaurant_tables t WHERE t.id=? OR t.id IN (SELECT table_id FROM reservation_tables WHERE reservation_id=?) ORDER BY t.number', (item['table_id'], item['id'])).fetchall()
        item['table_ids'] = [table['id'] for table in tables]
        item['table_numbers'] = [table['number'] for table in tables]
        records.append(item)
    return records


def available_tables(db, tables, start):
    end = start + timedelta(minutes=SLOT_MINUTES)
    conflicts = db.execute("SELECT id,table_id FROM reservations WHERE status='confirmed' AND julianday(reserved_at)<julianday(?) AND julianday(reserved_at)+duration_minutes/1440.0>julianday(?)", (end.isoformat(), start.isoformat())).fetchall()
    blocked = set()
    for conflict in conflicts:
        blocked.add(conflict['table_id'])
        blocked.update(row[0] for row in db.execute('SELECT table_id FROM reservation_tables WHERE reservation_id=?', (conflict['id'],)))
    near_now = start < datetime.now(timezone.utc) + timedelta(minutes=SLOT_MINUTES)
    return [table for table in tables
            if not blocked.intersection(table['merged_table_ids'])
            and not (near_now and table['status'] in ('occupied', 'cleaning'))]
