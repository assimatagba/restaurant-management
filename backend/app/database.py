import json
import hashlib
import secrets
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "restaurant.db"


def connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE_PATH)
    db.row_factory = sqlite3.Row
    return db


def rows_as_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(row) for row in rows]


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(password_salt), n=2**14, r=8, p=1).hex()
    return digest, password_salt


def seed_security(db: sqlite3.Connection) -> None:
    permissions = [
      ("audit.view", "Consulter le journal d’audit"), ("cash.close", "Clôturer la caisse"),
      ("cash.process", "Encaisser une commande"), ("discount.apply", "Appliquer une remise"),
      ("menu.manage", "Modifier la carte"), ("order.cancel", "Annuler une commande"),
      ("order.update", "Modifier le statut d’une commande"), ("reservation.manage", "Gérer les réservations"),
      ("service.manage", "Ouvrir ou fermer un service"), ("staff.manage", "Gérer les plannings"),
      ("table.manage", "Réassigner ou fusionner des tables"), ("table.view", "Consulter le plan de salle"),
    ]
    db.executemany("INSERT OR IGNORE INTO permissions(code, description) VALUES (?, ?)", permissions)
    db.execute("UPDATE users SET role='superadmin', is_super_admin=1 WHERE email='admin@epicea.local'")
    db.execute("UPDATE users SET role='manager' WHERE email='amadou@epicea.local'")
    if not db.execute("SELECT id FROM users WHERE email='admin@epicea.local'").fetchone():
      password_hash, password_salt = hash_password("Admin2026!")
      user_id = db.execute("INSERT INTO users(email,display_name,password_hash,password_salt,is_super_admin,role) VALUES (?,?,?,?,1,?)", ("admin@epicea.local", "Super administrateur", password_hash, password_salt, "superadmin")).lastrowid
      for permission in db.execute("SELECT id FROM permissions").fetchall():
        db.execute("INSERT INTO user_permission_grants(user_id, permission_id) VALUES (?,?)", (user_id, permission["id"]))
    if not db.execute("SELECT id FROM users WHERE email='amadou@epicea.local'").fetchone():
      password_hash, password_salt = hash_password("Manager2026!")
      manager_id = db.execute("INSERT INTO users(email,display_name,password_hash,password_salt,employee_id,role) VALUES (?,?,?,?,1,?)", ("amadou@epicea.local", "Amadou Diallo", password_hash, password_salt, "manager")).lastrowid
      for code in ("menu.manage", "order.cancel", "order.update", "cash.close", "cash.process", "reservation.manage", "service.manage", "staff.manage", "table.manage", "table.view", "audit.view"):
        permission_id = db.execute("SELECT id FROM permissions WHERE code=?", (code,)).fetchone()["id"]
        db.execute("INSERT INTO user_permission_grants(user_id, permission_id) VALUES (?,?)", (manager_id, permission_id))
    profiles = {
      "mariam@epicea.local": ("Mariam Sarr", "Serveur2026!", "server", ("order.cancel", "order.update", "table.manage", "table.view")),
      "caisse@epicea.local": ("Aïssatou Ndiaye", "Caisse2026!", "cashier", ("cash.process", "cash.close", "reservation.manage", "table.view")),
    }
    for email, (name, password, role, codes) in profiles.items():
      if db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
        continue
      password_hash, password_salt = hash_password(password)
      user_id = db.execute("INSERT INTO users(email,display_name,password_hash,password_salt,role) VALUES (?,?,?,?,?)", (email, name, password_hash, password_salt, role)).lastrowid
      for code in codes:
        permission_id = db.execute("SELECT id FROM permissions WHERE code=?", (code,)).fetchone()["id"]
        db.execute("INSERT INTO user_permission_grants(user_id, permission_id) VALUES (?,?)", (user_id, permission_id))


def initialize_database() -> None:
    with connection() as db:
        db.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS menu_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL,
              description TEXT NOT NULL DEFAULT '', available INTEGER NOT NULL DEFAULT 1,
              featured INTEGER NOT NULL DEFAULT 0, dietary_tags TEXT NOT NULL DEFAULT '[]',
              allergens TEXT NOT NULL DEFAULT '[]', preparation_minutes INTEGER NOT NULL DEFAULT 20
            );
            CREATE TABLE IF NOT EXISTS restaurant_tables (
              id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER UNIQUE NOT NULL,
              capacity INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'free', server_name TEXT
            );
            CREATE TABLE IF NOT EXISTS orders (
              id INTEGER PRIMARY KEY AUTOINCREMENT, public_number TEXT UNIQUE NOT NULL,
              table_id INTEGER, origin_table_id INTEGER, order_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received',
              notes TEXT NOT NULL DEFAULT '', total REAL NOT NULL DEFAULT 0,
              payment_status TEXT NOT NULL DEFAULT 'unpaid', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(table_id) REFERENCES restaurant_tables(id)
            );
            CREATE TABLE IF NOT EXISTS order_lines (
              id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, menu_item_id INTEGER,
              label TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, notes TEXT NOT NULL DEFAULT '',
              FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
              FOREIGN KEY(menu_item_id) REFERENCES menu_items(id)
            );
            CREATE TABLE IF NOT EXISTS payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, amount REAL NOT NULL,
              method TEXT NOT NULL, cashier_name TEXT NOT NULL, paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(order_id) REFERENCES orders(id)
            );
            CREATE TABLE IF NOT EXISTS employees (
              id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL,
              contract_type TEXT NOT NULL, hire_date TEXT NOT NULL, email TEXT
            );
            CREATE TABLE IF NOT EXISTS leave_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL,
              start_date TEXT NOT NULL, end_date TEXT NOT NULL, reason TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending', FOREIGN KEY(employee_id) REFERENCES employees(id)
            );
            CREATE TABLE IF NOT EXISTS audit_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
              target TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reservations (
              id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
              contact TEXT NOT NULL, reserved_at TEXT NOT NULL, party_size INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
              created_by TEXT NOT NULL, FOREIGN KEY(table_id) REFERENCES restaurant_tables(id)
            );
            CREATE TABLE IF NOT EXISTS service_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, service_date TEXT NOT NULL, service_type TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'open', manager_name TEXT NOT NULL, opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              closed_at TEXT, theoretical_total REAL, actual_total REAL, discrepancy REAL
            );
            CREATE TABLE IF NOT EXISTS cash_register_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, service_id INTEGER, opening_float REAL NOT NULL,
              actual_total REAL, status TEXT NOT NULL DEFAULT 'open', opened_by TEXT NOT NULL,
              opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT,
              FOREIGN KEY(service_id) REFERENCES service_sessions(id)
            );
            CREATE TABLE IF NOT EXISTS server_calls (
              id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER, request_type TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(table_id) REFERENCES restaurant_tables(id)
            );
            CREATE TABLE IF NOT EXISTS permissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, description TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_permissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, permission_id INTEGER NOT NULL,
              FOREIGN KEY(employee_id) REFERENCES employees(id), FOREIGN KEY(permission_id) REFERENCES permissions(id),
              UNIQUE(employee_id, permission_id)
            );
            CREATE TABLE IF NOT EXISTS shifts (
              id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, shift_date TEXT NOT NULL,
              start_time TEXT NOT NULL, end_time TEXT NOT NULL, FOREIGN KEY(employee_id) REFERENCES employees(id)
            );
            CREATE TABLE IF NOT EXISTS wait_time_rules (
              id INTEGER PRIMARY KEY AUTOINCREMENT, min_orders INTEGER NOT NULL, max_orders INTEGER NOT NULL,
              estimated_minutes INTEGER NOT NULL, updated_by TEXT NOT NULL DEFAULT 'Caisse'
            );
            CREATE TABLE IF NOT EXISTS table_merges (
              id INTEGER PRIMARY KEY AUTOINCREMENT, source_table_id INTEGER NOT NULL, target_table_id INTEGER NOT NULL,
              merged_by TEXT NOT NULL, source_status TEXT, source_server_name TEXT, target_server_name TEXT,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(source_table_id) REFERENCES restaurant_tables(id),
              FOREIGN KEY(target_table_id) REFERENCES restaurant_tables(id)
            );
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
              password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, employee_id INTEGER, is_super_admin INTEGER NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(employee_id) REFERENCES employees(id)
            );
            CREATE TABLE IF NOT EXISTS user_permission_grants (
              id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, permission_id INTEGER NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
              UNIQUE(user_id, permission_id)
            );
            CREATE TABLE IF NOT EXISTS auth_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
              expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        try:
          db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'server'")
        except sqlite3.OperationalError:
          pass
        try:
          db.execute("ALTER TABLE orders ADD COLUMN origin_table_id INTEGER")
        except sqlite3.OperationalError:
          pass
        for column in ("source_status TEXT", "source_server_name TEXT", "target_server_name TEXT"):
          try:
            db.execute(f"ALTER TABLE table_merges ADD COLUMN {column}")
          except sqlite3.OperationalError:
            pass
        if db.execute("SELECT COUNT(*) FROM menu_items").fetchone()[0]:
          db.executemany("INSERT OR IGNORE INTO permissions(code, description) VALUES (?, ?)", [("menu.manage","Modifier la carte"),("order.cancel","Annuler une commande"),("discount.apply","Appliquer une remise"),("cash.close","Clôturer la caisse"),("staff.manage","Gérer les plannings")])
          if not db.execute("SELECT COUNT(*) FROM wait_time_rules").fetchone()[0]: db.executemany("INSERT INTO wait_time_rules(min_orders, max_orders, estimated_minutes, updated_by) VALUES (?, ?, ?, ?)", [(0,5,30,"Caisse"),(6,15,45,"Caisse"),(16,999,60,"Cuisine")])
          if not db.execute("SELECT COUNT(*) FROM service_sessions").fetchone()[0]: db.execute("INSERT INTO service_sessions(service_date, service_type, manager_name) VALUES ('2026-09-18', 'lunch', 'Amadou Diallo')")
          if not db.execute("SELECT COUNT(*) FROM cash_register_sessions").fetchone()[0]: db.execute("INSERT INTO cash_register_sessions(service_id, opening_float, opened_by) VALUES (1, 100, 'Amadou Diallo')")
          seed_security(db)
          return
        db.executemany(
            "INSERT INTO menu_items(name, category, price, description, featured, dietary_tags, allergens, preparation_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("Poulet yassa", "Plats", 14, "Poulet mariné, oignons confits et riz parfumé.", 1, json.dumps(["Sans gluten"]), json.dumps([]), 25),
                ("Thiéboudienne", "Plats", 16, "Poisson, riz rouge et légumes de saison.", 0, json.dumps(["Sans gluten"]), json.dumps(["Poisson"]), 30),
                ("Burger Épicéa", "Plats", 15.5, "Bœuf grillé, cheddar, oignons et sauce maison.", 0, json.dumps([]), json.dumps(["Gluten", "Lait"]), 20),
                ("Salade quinoa", "Entrées", 8.5, "Avocat, légumes croquants et vinaigrette citron.", 0, json.dumps(["Végétarien", "Sans gluten"]), json.dumps([]), 12),
                ("Pastels de poisson", "Entrées", 7, "Beignets croustillants et sauce tomate épicée.", 0, json.dumps([]), json.dumps(["Poisson", "Gluten"]), 18),
                ("Café gourmand", "Desserts", 7.5, "Assortiment de douceurs du jour.", 0, json.dumps(["Végétarien"]), json.dumps(["Gluten", "Lait"]), 8),
            ],
        )
        db.executemany("INSERT INTO restaurant_tables(number, capacity, status, server_name) VALUES (?, ?, ?, ?)", [(1,2,"free",None),(2,4,"occupied","Mariam Sarr"),(3,2,"occupied","Mariam Sarr"),(4,4,"occupied","Amadou Diallo"),(5,2,"free",None),(6,6,"occupied","Khadim Ba"),(7,4,"cleaning",None),(8,2,"occupied","Khadim Ba")])
        db.executemany("INSERT INTO employees(name, role, contract_type, hire_date, email) VALUES (?, ?, ?, ?, ?)", [("Amadou Diallo","Manager","CDI","2023-03-01","amadou@epicea.test"),("Mariam Sarr","Serveuse","CDI","2024-01-15","mariam@epicea.test"),("Khadim Ba","Serveur","CDD","2025-06-01","khadim@epicea.test")])
        db.execute("INSERT INTO leave_requests(employee_id, start_date, end_date, reason) VALUES (2, '2026-09-23', '2026-09-27', 'Congé annuel')")
        db.executemany("INSERT INTO permissions(code, description) VALUES (?, ?)", [("menu.manage","Modifier la carte"),("order.cancel","Annuler une commande"),("discount.apply","Appliquer une remise"),("cash.close","Clôturer la caisse"),("staff.manage","Gérer les plannings")])
        db.executemany("INSERT INTO user_permissions(employee_id, permission_id) VALUES (?, ?)", [(1,1),(1,2),(1,3),(1,4),(1,5),(2,2)])
        db.executemany("INSERT INTO shifts(employee_id, shift_date, start_time, end_time) VALUES (?, ?, ?, ?)", [(1,"2026-09-18","11:00","15:00"),(2,"2026-09-18","11:00","15:00"),(3,"2026-09-18","11:00","15:00")])
        db.executemany("INSERT INTO wait_time_rules(min_orders, max_orders, estimated_minutes, updated_by) VALUES (?, ?, ?, ?)", [(0,5,30,"Caisse"),(6,15,45,"Caisse"),(16,999,60,"Cuisine")])
        db.execute("INSERT INTO service_sessions(service_date, service_type, manager_name) VALUES ('2026-09-18', 'lunch', 'Amadou Diallo')")
        db.execute("INSERT INTO cash_register_sessions(service_id, opening_float, opened_by) VALUES (1, 100, 'Amadou Diallo')")
        seed_security(db)
        db.execute("INSERT INTO audit_logs(actor, action, target, details) VALUES ('Système', 'INITIALISATION', 'restaurant', 'Données de démonstration créées')")


def write_audit(db: sqlite3.Connection, actor: str, action: str, target: str, details: str = "") -> None:
    db.execute("INSERT INTO audit_logs(actor, action, target, details) VALUES (?, ?, ?, ?)", (actor, action, target, details))
