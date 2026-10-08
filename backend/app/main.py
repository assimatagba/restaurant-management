import json
import hmac
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import connection, hash_password, initialize_database, rows_as_dicts, write_audit
from .schemas import AvailabilityInput, CashCloseCreate, CashOpenCreate, LeaveStatusInput, LoginInput, MenuItemInput, OrderCreate, OrderStatusInput, PaymentCreate, PermissionGrantsInput, ProfileUpdate, ReservationCreate, ServiceCreate, ShiftCreate, TableAssignmentInput, TableCreate, TableMergeInput, TableStatusInput, UserCreate, WaitTimeRuleCreate


def serialize_menu(row: dict) -> dict:
    row["available"] = bool(row["available"])
    row["featured"] = bool(row["featured"])
    row["dietary_tags"] = json.loads(row["dietary_tags"])
    row["allergens"] = json.loads(row["allergens"])
    return row


def order_details(db, order_id: int) -> dict:
    order = db.execute("SELECT o.*, t.number AS table_number, COALESCE(origin.number, t.number) AS origin_table_number FROM orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id LEFT JOIN restaurant_tables origin ON origin.id=o.origin_table_id WHERE o.id=?", (order_id,)).fetchone()
    if not order:
        raise HTTPException(404, "Commande introuvable")
    data = dict(order)
    data["lines"] = rows_as_dicts(db.execute("SELECT id, menu_item_id, label, quantity, unit_price, notes FROM order_lines WHERE order_id=?", (order_id,)).fetchall())
    return data


def user_payload(db, user_id: int) -> dict:
    user = db.execute("SELECT id,email,display_name,employee_id,is_super_admin,active,role FROM users WHERE id=?", (user_id,)).fetchone()
    if not user: raise HTTPException(401, "Utilisateur introuvable")
    data = dict(user)
    data["is_super_admin"] = bool(data["is_super_admin"])
    data["permissions"] = [row["code"] for row in db.execute("SELECT p.code FROM user_permission_grants g JOIN permissions p ON p.id=g.permission_id WHERE g.user_id=? ORDER BY p.code", (user_id,)).fetchall()]
    return data


def floor_tables(db) -> list[dict]:
    """Return the physical tables as the consolidated tables shown on the floor plan."""
    tables = rows_as_dicts(db.execute("SELECT * FROM restaurant_tables ORDER BY number").fetchall())
    by_id = {table["id"]: table for table in tables}
    children: dict[int, list[int]] = {}
    merge_rows = rows_as_dicts(db.execute(
        "SELECT tm.source_table_id, tm.target_table_id, tm.merged_by, "
        "COALESCE(u.role, '') AS merged_by_role, tm.created_at, tm.id "
        "FROM table_merges tm LEFT JOIN users u ON lower(u.display_name)=lower(tm.merged_by) "
        "ORDER BY tm.created_at DESC, tm.id DESC"
    ).fetchall())
    for merge in merge_rows:
        children.setdefault(merge["target_table_id"], []).append(merge["source_table_id"])
    merged_sources = {source_id for source_ids in children.values() for source_id in source_ids}

    def members(table_id: int) -> list[int]:
        return [table_id] + [member_id for child_id in children.get(table_id, []) for member_id in members(child_id)]

    result = []
    for table in tables:
        if table["id"] in merged_sources:
            continue
        group = [by_id[member_id] for member_id in members(table["id"]) if member_id in by_id]
        display = dict(table)
        display["capacity"] = sum(member["capacity"] for member in group)
        display["merged_table_ids"] = [member["id"] for member in group]
        display["display_number"] = " + ".join(map(str, sorted((member["number"] for member in group), reverse=True)))
        latest_merge = next((merge for merge in merge_rows if merge["target_table_id"] == table["id"]), None)
        display["merged_by_name"] = latest_merge["merged_by"] if latest_merge else None
        display["merged_by_role"] = latest_merge["merged_by_role"] if latest_merge else None
        result.append(display)
    return result


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentification requise")
    token = authorization.removeprefix("Bearer ")
    with connection() as db:
        db.execute("DELETE FROM auth_sessions WHERE expires_at<?", (datetime.now(timezone.utc).isoformat(),))
        session = db.execute("SELECT user_id FROM auth_sessions WHERE token=?", (token,)).fetchone()
        if not session: raise HTTPException(401, "Session invalide ou expirée")
        user = user_payload(db, session["user_id"])
        if not user["active"]: raise HTTPException(403, "Compte désactivé")
        return user


def require_permission(permission: str):
    def dependency(user: dict = Depends(current_user)) -> dict:
        if user["is_super_admin"] or permission in user["permissions"]:
            return user
        raise HTTPException(403, f"Permission requise : {permission}")
    return dependency


def require_super_admin(user: dict = Depends(current_user)) -> dict:
    if not user["is_super_admin"]: raise HTTPException(403, "Accès réservé au super administrateur")
    return user


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Épicéa Restaurant API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "epicea-api"}


@app.post("/api/auth/login")
def login(credentials: LoginInput):
    with connection() as db:
        user = db.execute("SELECT * FROM users WHERE lower(email)=lower(?) AND active=1", (credentials.email.strip(),)).fetchone()
        if not user: raise HTTPException(401, "Identifiants incorrects")
        password_hash, _ = hash_password(credentials.password, user["password_salt"])
        if not hmac.compare_digest(password_hash, user["password_hash"]): raise HTTPException(401, "Identifiants incorrects")
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()
        db.execute("INSERT INTO auth_sessions(user_id,token,expires_at) VALUES (?,?,?)", (user["id"],token,expires_at))
        write_audit(db, user["display_name"], "LOGIN", f"user:{user['id']}")
        return {"access_token": token, "token_type": "bearer", "expires_at": expires_at, "user": user_payload(db, user["id"])}


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)):
    return user


@app.patch("/api/auth/me")
def update_my_profile(payload: ProfileUpdate, user: dict = Depends(current_user)):
    if payload.new_password and not payload.current_password:
        raise HTTPException(422, "Le mot de passe actuel est requis")
    with connection() as db:
        account = db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
        if payload.email and payload.email.strip().lower() != account["email"]:
            if db.execute("SELECT id FROM users WHERE lower(email)=lower(?) AND id!=?", (payload.email.strip(), user["id"])).fetchone():
                raise HTTPException(409, "Cette adresse email est déjà utilisée")
            db.execute("UPDATE users SET email=? WHERE id=?", (payload.email.strip().lower(), user["id"]))
        if payload.display_name:
            db.execute("UPDATE users SET display_name=? WHERE id=?", (payload.display_name.strip(), user["id"]))
        if payload.new_password:
            password_hash, _ = hash_password(payload.current_password, account["password_salt"])
            if not hmac.compare_digest(password_hash, account["password_hash"]):
                raise HTTPException(401, "Mot de passe actuel incorrect")
            new_hash, new_salt = hash_password(payload.new_password)
            db.execute("UPDATE users SET password_hash=?, password_salt=? WHERE id=?", (new_hash, new_salt, user["id"]))
        write_audit(db, user["display_name"], "UPDATE_MY_PROFILE", f"user:{user['id']}")
        return user_payload(db, user["id"])


@app.post("/api/auth/logout", status_code=204)
def logout(authorization: str | None = Header(default=None), user: dict = Depends(current_user)):
    with connection() as db:
        db.execute("DELETE FROM auth_sessions WHERE token=?", (authorization.removeprefix("Bearer "),))
        write_audit(db, user["display_name"], "LOGOUT", f"user:{user['id']}")


@app.get("/api/users")
def list_users(_: dict = Depends(require_super_admin)):
    with connection() as db:
        return [user_payload(db, row["id"]) for row in db.execute("SELECT id FROM users ORDER BY display_name").fetchall()]


@app.post("/api/users", status_code=201)
def create_user(payload: UserCreate, actor: dict = Depends(require_super_admin)):
    with connection() as db:
        if db.execute("SELECT id FROM users WHERE lower(email)=lower(?)", (payload.email.strip(),)).fetchone(): raise HTTPException(409, "Cet email est déjà utilisé")
        password_hash, password_salt = hash_password(payload.password)
        cursor = db.execute("INSERT INTO users(email,display_name,password_hash,password_salt,employee_id,is_super_admin,role) VALUES (?,?,?,?,?,?,?)", (payload.email.strip().lower(),payload.display_name,password_hash,password_salt,payload.employee_id,int(payload.is_super_admin),payload.role))
        profile_permissions = {"manager": ["menu.manage","order.cancel","order.update","cash.close","cash.process","reservation.manage","service.manage","staff.manage","table.manage","table.view","audit.view"], "server": ["order.cancel","order.update","table.manage","table.view"], "cashier": ["cash.process","cash.close","reservation.manage","table.view"]}
        for code in profile_permissions[payload.role]:
            permission = db.execute("SELECT id FROM permissions WHERE code=?", (code,)).fetchone()
            if permission: db.execute("INSERT INTO user_permission_grants(user_id,permission_id) VALUES (?,?)", (cursor.lastrowid, permission["id"]))
        write_audit(db, actor["display_name"], "CREATE_USER", f"user:{cursor.lastrowid}", payload.email)
        return user_payload(db, cursor.lastrowid)


@app.put("/api/users/{user_id}/permissions")
def replace_user_permissions(user_id: int, payload: PermissionGrantsInput, actor: dict = Depends(require_super_admin)):
    with connection() as db:
        if not db.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone(): raise HTTPException(404, "Utilisateur introuvable")
        requested = set(payload.permission_codes)
        known = {row["code"]: row["id"] for row in db.execute("SELECT id,code FROM permissions").fetchall()}
        unknown = requested - set(known)
        if unknown: raise HTTPException(422, f"Permissions inconnues : {', '.join(sorted(unknown))}")
        db.execute("DELETE FROM user_permission_grants WHERE user_id=?", (user_id,))
        db.executemany("INSERT INTO user_permission_grants(user_id,permission_id) VALUES (?,?)", [(user_id, known[code]) for code in requested])
        write_audit(db, actor["display_name"], "UPDATE_USER_PERMISSIONS", f"user:{user_id}", ", ".join(sorted(requested)))
        return user_payload(db, user_id)


@app.get("/api/menu")
def list_menu(available_only: bool = False):
    with connection() as db:
        query = "SELECT * FROM menu_items"
        if available_only:
            query += " WHERE available=1"
        query += " ORDER BY featured DESC, category, name"
        return [serialize_menu(item) for item in rows_as_dicts(db.execute(query).fetchall())]


@app.post("/api/menu", status_code=201)
def create_menu_item(item: MenuItemInput, _: dict = Depends(require_permission("menu.manage"))):
    with connection() as db:
        cursor = db.execute("INSERT INTO menu_items(name,category,price,description,dietary_tags,allergens,preparation_minutes) VALUES (?,?,?,?,?,?,?)", (item.name, item.category, item.price, item.description, json.dumps(item.dietary_tags), json.dumps(item.allergens), item.preparation_minutes))
        write_audit(db, "Manager", "CREATE_MENU_ITEM", f"menu:{cursor.lastrowid}", item.name)
        return serialize_menu(dict(db.execute("SELECT * FROM menu_items WHERE id=?", (cursor.lastrowid,)).fetchone()))


@app.patch("/api/menu/{item_id}/availability")
def set_availability(item_id: int, payload: AvailabilityInput, _: dict = Depends(require_permission("menu.manage"))):
    with connection() as db:
        if not db.execute("SELECT id FROM menu_items WHERE id=?", (item_id,)).fetchone():
            raise HTTPException(404, "Plat introuvable")
        db.execute("UPDATE menu_items SET available=? WHERE id=?", (int(payload.available), item_id))
        write_audit(db, "Cuisine", "SET_AVAILABILITY", f"menu:{item_id}", str(payload.available))
        return {"id": item_id, "available": payload.available}


@app.get("/api/tables")
def list_tables(_: dict = Depends(require_permission("table.view"))):
    with connection() as db:
        return floor_tables(db)


@app.post("/api/tables", status_code=201)
def create_table(payload: TableCreate, user: dict = Depends(require_permission("table.manage"))):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        number = db.execute("SELECT COALESCE(MAX(number), 0) + 1 FROM restaurant_tables").fetchone()[0]
        cursor = db.execute(
            "INSERT INTO restaurant_tables(number, capacity, status) VALUES (?, ?, 'free')",
            (number, payload.capacity),
        )
        write_audit(db, user["display_name"], "CREATE_TABLE", f"table:{number}", f"capacity:{payload.capacity}")
        return dict(db.execute("SELECT * FROM restaurant_tables WHERE id=?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/tables/{table_id}/assignment")
def assign_table(table_id: int, assignment: TableAssignmentInput, _: dict = Depends(require_permission("table.manage"))):
    with connection() as db:
        if not db.execute("SELECT id FROM restaurant_tables WHERE id=?", (table_id,)).fetchone(): raise HTTPException(404, "Table introuvable")
        db.execute("UPDATE restaurant_tables SET server_name=? WHERE id=?", (assignment.server_name, table_id))
        write_audit(db, "Manager", "ASSIGN_TABLE", f"table:{table_id}", assignment.server_name)
        return {"table_id": table_id, "server_name": assignment.server_name}


@app.patch("/api/tables/{table_id}/status")
def update_table_status(table_id: int, payload: TableStatusInput, user: dict = Depends(require_permission("table.manage"))):
    with connection() as db:
        table = db.execute("SELECT id FROM restaurant_tables WHERE id=?", (table_id,)).fetchone()
        if not table: raise HTTPException(404, "Table introuvable")
        if payload.status == "free" and db.execute("SELECT id FROM orders WHERE table_id=? AND payment_status='unpaid' AND status!='cancelled' LIMIT 1", (table_id,)).fetchone():
            raise HTTPException(409, "La table ne peut pas être libérée tant qu’une commande reste impayée.")
        server_name = None if payload.status == "free" else db.execute("SELECT server_name FROM restaurant_tables WHERE id=?", (table_id,)).fetchone()["server_name"]
        db.execute("UPDATE restaurant_tables SET status=?, server_name=? WHERE id=?", (payload.status, server_name, table_id))
        write_audit(db, user["display_name"], "UPDATE_TABLE_STATUS", f"table:{table_id}", payload.status)
        return {"table_id": table_id, "status": payload.status, "server_name": server_name}


@app.get("/api/tables/{table_id}/history")
def table_history(table_id: int, _: dict = Depends(require_permission("table.view"))):
    with connection() as db:
        if not db.execute("SELECT id FROM restaurant_tables WHERE id=?", (table_id,)).fetchone(): raise HTTPException(404, "Table introuvable")
        rows = db.execute("SELECT id FROM orders WHERE table_id=? ORDER BY created_at DESC", (table_id,)).fetchall()
        return [order_details(db, row["id"]) for row in rows]


@app.post("/api/tables/merge")
def merge_tables(merge: TableMergeInput, user: dict = Depends(require_permission("table.manage"))):
    if len(set(merge.table_ids)) != len(merge.table_ids):
        raise HTTPException(422, "Chaque table ne peut être sélectionnée qu’une seule fois.")
    if merge.target_table_id not in merge.table_ids:
        raise HTTPException(422, "La table cible doit faire partie de la sélection.")
    source_table_ids = [table_id for table_id in merge.table_ids if table_id != merge.target_table_id]
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        placeholders = ",".join("?" for _ in merge.table_ids)
        existing_ids = {row["id"] for row in db.execute(f"SELECT id FROM restaurant_tables WHERE id IN ({placeholders})", merge.table_ids).fetchall()}
        if existing_ids != set(merge.table_ids):
            raise HTTPException(404, "Une ou plusieurs tables sont introuvables.")
        selected_tables = rows_as_dicts(db.execute(f"SELECT * FROM restaurant_tables WHERE id IN ({placeholders})", merge.table_ids).fetchall())
        tables_by_id = {table["id"]: table for table in selected_tables}
        target_server_before_merge = tables_by_id[merge.target_table_id]["server_name"]
        assigned_server = max(selected_tables, key=lambda table: table["number"])["server_name"]
        merge_ids = []
        for source_table_id in source_table_ids:
            db.execute(
                "UPDATE orders SET origin_table_id=COALESCE(origin_table_id, table_id), table_id=? WHERE table_id=? AND payment_status='unpaid' AND status!='cancelled'",
                (merge.target_table_id, source_table_id),
            )
            db.execute("UPDATE restaurant_tables SET status='free', server_name=NULL WHERE id=?", (source_table_id,))
            cursor = db.execute(
                "INSERT INTO table_merges(source_table_id,target_table_id,merged_by,source_status,source_server_name,target_server_name) VALUES (?,?,?,?,?,?)",
                (source_table_id, merge.target_table_id, user["display_name"], tables_by_id[source_table_id]["status"], tables_by_id[source_table_id]["server_name"], target_server_before_merge),
            )
            merge_ids.append(cursor.lastrowid)
            write_audit(
                db,
                user["display_name"],
                "MERGE_TABLES",
                f"merge:{cursor.lastrowid}",
                f"{source_table_id} vers {merge.target_table_id}",
            )
        db.execute("UPDATE restaurant_tables SET server_name=? WHERE id=?", (assigned_server, merge.target_table_id))
        merged_table = next(table for table in floor_tables(db) if table["id"] == merge.target_table_id)
        return {"merge_ids": merge_ids, "source_table_ids": source_table_ids, "target_table_id": merge.target_table_id, "table": merged_table}


@app.post("/api/tables/{table_id}/unmerge")
def unmerge_tables(table_id: int, user: dict = Depends(require_permission("table.manage"))):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        merges = rows_as_dicts(db.execute("SELECT * FROM table_merges WHERE target_table_id=? ORDER BY id", (table_id,)).fetchall())
        if not merges:
            raise HTTPException(404, "Cette table n’est pas issue d’une fusion active.")
        target_server_name = merges[0]["target_server_name"]
        for merge in merges:
            source_group_ids = [merge["source_table_id"]]
            pending_ids = [merge["source_table_id"]]
            while pending_ids:
                parent_id = pending_ids.pop()
                children = [row["source_table_id"] for row in db.execute("SELECT source_table_id FROM table_merges WHERE target_table_id=?", (parent_id,)).fetchall()]
                source_group_ids.extend(children)
                pending_ids.extend(children)
            source_placeholders = ",".join("?" for _ in source_group_ids)
            db.execute(
                f"UPDATE orders SET table_id=? WHERE table_id=? AND origin_table_id IN ({source_placeholders})",
                [merge["source_table_id"], table_id, *source_group_ids],
            )
            db.execute(
                "UPDATE restaurant_tables SET status=?, server_name=? WHERE id=?",
                (merge["source_status"] or "free", merge["source_server_name"], merge["source_table_id"]),
            )
            write_audit(db, user["display_name"], "UNMERGE_TABLES", f"merge:{merge['id']}", f"Table {merge['source_table_id']} dissociée de {table_id}")
        db.execute("UPDATE restaurant_tables SET server_name=? WHERE id=?", (target_server_name, table_id))
        db.execute("DELETE FROM table_merges WHERE target_table_id=?", (table_id,))
        return {"target_table_id": table_id, "tables": floor_tables(db)}


@app.get("/api/server-calls")
def list_server_calls(_: dict = Depends(require_permission("table.view"))):
    with connection() as db:
        return rows_as_dicts(db.execute("SELECT c.*, t.number AS table_number FROM server_calls c LEFT JOIN restaurant_tables t ON t.id=c.table_id WHERE c.status='pending' ORDER BY c.created_at").fetchall())


@app.get("/api/reservations")
def list_reservations(_: dict = Depends(require_permission("reservation.manage"))):
    with connection() as db:
        return rows_as_dicts(db.execute("SELECT r.*, t.number AS table_number FROM reservations r JOIN restaurant_tables t ON t.id=r.table_id ORDER BY r.reserved_at").fetchall())


@app.post("/api/reservations", status_code=201)
def create_reservation(reservation: ReservationCreate, _: dict = Depends(require_permission("reservation.manage"))):
    with connection() as db:
        if not db.execute("SELECT id FROM restaurant_tables WHERE id=?", (reservation.table_id,)).fetchone(): raise HTTPException(404, "Table introuvable")
        cursor = db.execute("INSERT INTO reservations(table_id,customer_name,contact,reserved_at,party_size,created_by) VALUES (?,?,?,?,?,?)", (reservation.table_id,reservation.customer_name,reservation.contact,reservation.reserved_at,reservation.party_size,reservation.created_by))
        db.execute("UPDATE restaurant_tables SET status='reserved' WHERE id=?", (reservation.table_id,))
        write_audit(db, reservation.created_by, "CREATE_RESERVATION", f"reservation:{cursor.lastrowid}", reservation.customer_name)
        return {"id": cursor.lastrowid, "status": "confirmed"}


@app.get("/api/orders")
def list_orders(status: str | None = None, _: dict = Depends(current_user)):
    with connection() as db:
        query, params = "SELECT id FROM orders", []
        if status:
            query += " WHERE status=?"; params.append(status)
        query += " ORDER BY created_at DESC"
        return [order_details(db, row["id"]) for row in db.execute(query, params).fetchall()]


@app.post("/api/orders", status_code=201)
def create_order(order: OrderCreate, user: dict = Depends(require_permission("order.update"))):
    if order.order_type == "dine_in" and not order.table_id:
        raise HTTPException(422, "Une table est requise pour le service sur place")
    with connection() as db:
        if order.table_id and not db.execute("SELECT id FROM restaurant_tables WHERE id=?", (order.table_id,)).fetchone():
            raise HTTPException(404, "Table introuvable")
        items = []
        for line in order.lines:
            item = db.execute("SELECT * FROM menu_items WHERE id=? AND available=1", (line.menu_item_id,)).fetchone()
            if not item: raise HTTPException(422, f"Le plat {line.menu_item_id} est indisponible")
            items.append((item, line))
        total = sum(item["price"] * line.quantity for item, line in items)
        number = f"#{1000 + db.execute('SELECT COUNT(*) FROM orders').fetchone()[0] + 1}"
        cursor = db.execute("INSERT INTO orders(public_number,table_id,order_type,notes,total) VALUES (?,?,?,?,?)", (number, order.table_id, order.order_type, order.notes, total))
        for item, line in items:
            db.execute("INSERT INTO order_lines(order_id,menu_item_id,label,quantity,unit_price,notes) VALUES (?,?,?,?,?,?)", (cursor.lastrowid,item["id"],item["name"],line.quantity,item["price"],line.notes))
        if order.table_id: db.execute("UPDATE restaurant_tables SET status='occupied' WHERE id=?", (order.table_id,))
        write_audit(db, user["display_name"], "CREATE_ORDER", f"order:{cursor.lastrowid}", number)
        return order_details(db, cursor.lastrowid)


@app.patch("/api/orders/{order_id}/status")
def update_order_status(order_id: int, payload: OrderStatusInput, user: dict = Depends(current_user)):
    with connection() as db:
        order = db.execute("SELECT status FROM orders WHERE id=?", (order_id,)).fetchone()
        if not order: raise HTTPException(404, "Commande introuvable")
        if user.get("role") == "server":
            if payload.status not in {"served", "cancelled"}:
                raise HTTPException(403, "Le rôle serveur ne peut pas modifier le statut en cuisine.")
            if payload.status == "served" and order["status"] != "ready":
                raise HTTPException(409, "Seules les commandes prêtes peuvent être marquées servies.")
        required = "order.cancel" if payload.status == "cancelled" else "order.update"
        if not user["is_super_admin"] and required not in user["permissions"]: raise HTTPException(403, f"Permission requise : {required}")
        db.execute("UPDATE orders SET status=? WHERE id=?", (payload.status, order_id))
        write_audit(db, "Cuisine", "UPDATE_ORDER_STATUS", f"order:{order_id}", payload.status)
        return order_details(db, order_id)


@app.post("/api/orders/{order_id}/payments", status_code=201)
def pay_order(order_id: int, payment: PaymentCreate, _: dict = Depends(require_permission("cash.process"))):
    with connection() as db:
        order = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
        if not order: raise HTTPException(404, "Commande introuvable")
        if order["payment_status"] == "paid": raise HTTPException(409, "Cette commande est déjà réglée")
        paid_amount = db.execute("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE order_id=?", (order_id,)).fetchone()[0]
        if payment.amount - (order["total"] - paid_amount) > 0.01: raise HTTPException(422, "Le montant dépasse le solde de la commande")
        db.execute("INSERT INTO payments(order_id,amount,method,cashier_name) VALUES (?,?,?,?)", (order_id,payment.amount,payment.method,payment.cashier_name))
        remaining = round(order["total"] - paid_amount - payment.amount, 2)
        if remaining <= 0:
            db.execute("UPDATE orders SET payment_status='paid' WHERE id=?", (order_id,))
            if order["table_id"]: db.execute("UPDATE restaurant_tables SET status='cleaning' WHERE id=?", (order["table_id"],))
        write_audit(db, payment.cashier_name, "PAY_ORDER", f"order:{order_id}", payment.method)
        return {"order_id": order_id, "status": "paid" if remaining <= 0 else "partially_paid", "remaining_amount": max(remaining, 0), "receipt_email_status": "queued" if remaining <= 0 else "not_sent"}


@app.get("/api/employees")
def list_employees(_: dict = Depends(require_permission("staff.manage"))):
    with connection() as db: return rows_as_dicts(db.execute("SELECT * FROM employees ORDER BY name").fetchall())


@app.get("/api/shifts")
def list_shifts(employee_id: int | None = None, _: dict = Depends(require_permission("staff.manage"))):
    with connection() as db:
        query, params = "SELECT s.*, e.name AS employee_name FROM shifts s JOIN employees e ON e.id=s.employee_id", []
        if employee_id: query += " WHERE s.employee_id=?"; params.append(employee_id)
        return rows_as_dicts(db.execute(query + " ORDER BY shift_date, start_time", params).fetchall())


@app.post("/api/shifts", status_code=201)
def create_shift(shift: ShiftCreate, _: dict = Depends(require_permission("staff.manage"))):
    with connection() as db:
        if not db.execute("SELECT id FROM employees WHERE id=?", (shift.employee_id,)).fetchone(): raise HTTPException(404, "Employé introuvable")
        cursor = db.execute("INSERT INTO shifts(employee_id,shift_date,start_time,end_time) VALUES (?,?,?,?)", (shift.employee_id,shift.shift_date,shift.start_time,shift.end_time))
        write_audit(db, "Manager", "CREATE_SHIFT", f"shift:{cursor.lastrowid}", str(shift.employee_id))
        return {"id": cursor.lastrowid}


@app.get("/api/permissions")
def list_permissions(_: dict = Depends(require_super_admin)):
    with connection() as db:
        return rows_as_dicts(db.execute("SELECT p.*, GROUP_CONCAT(e.name) AS granted_to FROM permissions p LEFT JOIN user_permissions u ON u.permission_id=p.id LEFT JOIN employees e ON e.id=u.employee_id GROUP BY p.id ORDER BY p.code").fetchall())


@app.get("/api/leave-requests")
def list_leave_requests(_: dict = Depends(require_permission("staff.manage"))):
    with connection() as db:
        return rows_as_dicts(db.execute("SELECT l.*, e.name AS employee_name FROM leave_requests l JOIN employees e ON e.id=l.employee_id ORDER BY l.start_date").fetchall())


@app.patch("/api/leave-requests/{request_id}")
def decide_leave_request(request_id: int, payload: LeaveStatusInput, _: dict = Depends(require_permission("staff.manage"))):
    with connection() as db:
        if not db.execute("SELECT id FROM leave_requests WHERE id=?", (request_id,)).fetchone(): raise HTTPException(404, "Demande introuvable")
        db.execute("UPDATE leave_requests SET status=? WHERE id=?", (payload.status, request_id))
        write_audit(db, "Manager", "DECIDE_LEAVE", f"leave:{request_id}", payload.status)
        return {"id": request_id, "status": payload.status}


@app.get("/api/wait-time-rules")
def list_wait_time_rules():
    with connection() as db: return rows_as_dicts(db.execute("SELECT * FROM wait_time_rules ORDER BY min_orders").fetchall())


@app.get("/api/wait-time-estimate")
def get_wait_time_estimate():
    with connection() as db:
        active_orders = db.execute("SELECT COUNT(*) FROM orders WHERE status IN ('received','preparing')").fetchone()[0]
        rule = db.execute("SELECT estimated_minutes FROM wait_time_rules WHERE min_orders<=? AND max_orders>=? ORDER BY min_orders DESC LIMIT 1", (active_orders, active_orders)).fetchone()
        minutes = rule["estimated_minutes"] if rule else 30
        return {"active_orders": active_orders, "estimated_minutes": minutes, "label": f"environ {minutes} minutes"}


@app.post("/api/wait-time-rules", status_code=201)
def create_wait_time_rule(rule: WaitTimeRuleCreate, _: dict = Depends(require_permission("cash.process"))):
    if rule.max_orders < rule.min_orders: raise HTTPException(422, "Le maximum doit être supérieur au minimum")
    with connection() as db:
        cursor = db.execute("INSERT INTO wait_time_rules(min_orders,max_orders,estimated_minutes,updated_by) VALUES (?,?,?,?)", (rule.min_orders,rule.max_orders,rule.estimated_minutes,rule.updated_by))
        write_audit(db, rule.updated_by, "CREATE_WAIT_TIME_RULE", f"wait-rule:{cursor.lastrowid}")
        return {"id": cursor.lastrowid}


@app.get("/api/services")
def list_services(_: dict = Depends(require_permission("service.manage"))):
    with connection() as db: return rows_as_dicts(db.execute("SELECT * FROM service_sessions ORDER BY opened_at DESC").fetchall())


@app.post("/api/services", status_code=201)
def open_service(service: ServiceCreate, _: dict = Depends(require_permission("service.manage"))):
    with connection() as db:
        cursor = db.execute("INSERT INTO service_sessions(service_date,service_type,manager_name) VALUES (?,?,?)", (service.service_date,service.service_type,service.manager_name))
        write_audit(db, service.manager_name, "OPEN_SERVICE", f"service:{cursor.lastrowid}", service.service_type)
        return {"id": cursor.lastrowid, "status": "open"}


@app.post("/api/services/{service_id}/close")
def close_service(service_id: int, closing: CashCloseCreate, _: dict = Depends(require_permission("service.manage"))):
    with connection() as db:
        service = db.execute("SELECT id FROM service_sessions WHERE id=? AND status='open'", (service_id,)).fetchone()
        if not service: raise HTTPException(404, "Service ouvert introuvable")
        theoretical = db.execute("SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status='paid'").fetchone()[0]
        discrepancy = round(closing.actual_total - theoretical, 2)
        db.execute("UPDATE service_sessions SET status='closed',closed_at=CURRENT_TIMESTAMP,theoretical_total=?,actual_total=?,discrepancy=? WHERE id=?", (theoretical,closing.actual_total,discrepancy,service_id))
        db.execute("UPDATE restaurant_tables SET status='free' WHERE status IN ('cleaning','occupied','reserved')")
        write_audit(db, "Manager", "CLOSE_SERVICE", f"service:{service_id}", f"Écart {discrepancy}")
        return {"service_id": service_id, "theoretical_total": theoretical, "actual_total": closing.actual_total, "discrepancy": discrepancy}


@app.post("/api/cash-registers", status_code=201)
def open_cash_register(cash: CashOpenCreate, _: dict = Depends(require_permission("cash.close"))):
    with connection() as db:
        cursor = db.execute("INSERT INTO cash_register_sessions(service_id,opening_float,opened_by) VALUES (?,?,?)", (cash.service_id,cash.opening_float,cash.opened_by))
        write_audit(db, cash.opened_by, "OPEN_CASH_REGISTER", f"cash:{cursor.lastrowid}", str(cash.opening_float))
        return {"id": cursor.lastrowid, "status": "open"}


@app.post("/api/cash-registers/{register_id}/close")
def close_cash_register(register_id: int, closing: CashCloseCreate, _: dict = Depends(require_permission("cash.close"))):
    with connection() as db:
        register = db.execute("SELECT * FROM cash_register_sessions WHERE id=? AND status='open'", (register_id,)).fetchone()
        if not register: raise HTTPException(404, "Caisse ouverte introuvable")
        db.execute("UPDATE cash_register_sessions SET status='closed',actual_total=?,closed_at=CURRENT_TIMESTAMP WHERE id=?", (closing.actual_total,register_id))
        write_audit(db, "Caissier", "CLOSE_CASH_REGISTER", f"cash:{register_id}", str(closing.actual_total))
        return {"id": register_id, "status": "closed", "actual_total": closing.actual_total}


@app.get("/api/audit-logs")
def list_audit_logs(limit: int = 100, _: dict = Depends(require_permission("audit.view"))):
    with connection() as db: return rows_as_dicts(db.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (min(limit, 500),)).fetchall())


@app.get("/api/dashboard")
def dashboard(_: dict = Depends(current_user)):
    with connection() as db:
        revenue = db.execute("SELECT COALESCE(SUM(amount), 0) FROM payments").fetchone()[0]
        active = db.execute("SELECT COUNT(*) FROM orders WHERE status IN ('received','preparing','ready')").fetchone()[0]
        return {"revenue": revenue, "orders": db.execute("SELECT COUNT(*) FROM orders").fetchone()[0], "active_orders": active, "open_leave_requests": db.execute("SELECT COUNT(*) FROM leave_requests WHERE status='pending'").fetchone()[0]}


@app.get("/api/back-office/snapshot")
def back_office_snapshot(user: dict = Depends(current_user)):
    with connection() as db:
        status_labels = {"received": "reçue", "preparing": "préparation", "ready": "prête", "served": "servie", "cancelled": "annulée"}
        order_ids = db.execute("SELECT id FROM orders WHERE payment_status='unpaid' AND status!='cancelled' ORDER BY created_at DESC").fetchall()
        orders = [order_details(db, row["id"]) for row in order_ids]
        history_ids = db.execute("SELECT id FROM orders ORDER BY created_at DESC").fetchall()
        order_history = [order_details(db, row["id"]) for row in history_ids]
        revenue = db.execute("SELECT COALESCE(SUM(amount), 0) FROM payments").fetchone()[0]
        active = db.execute("SELECT COUNT(*) FROM orders WHERE status IN ('received','preparing','ready')").fetchone()[0]
        version = db.execute("SELECT COALESCE(MAX(id), 0) FROM audit_logs").fetchone()[0]
        return {"version": version, "user": user, "orders": orders, "order_history": order_history, "tables": floor_tables(db), "servers": rows_as_dicts(db.execute("SELECT id, display_name FROM users WHERE role='server' ORDER BY display_name").fetchall()), "server_calls": rows_as_dicts(db.execute("SELECT c.*, t.number AS table_number FROM server_calls c LEFT JOIN restaurant_tables t ON t.id=c.table_id WHERE c.status='pending' ORDER BY c.created_at").fetchall()), "leave_requests": rows_as_dicts(db.execute("SELECT l.*, e.name AS employee_name FROM leave_requests l JOIN employees e ON e.id=l.employee_id ORDER BY l.start_date").fetchall()), "audit_logs": rows_as_dicts(db.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 4").fetchall()), "dashboard": {"revenue": revenue, "orders": db.execute("SELECT COUNT(*) FROM orders").fetchone()[0], "active_orders": active, "leave_requests": db.execute("SELECT COUNT(*) FROM leave_requests WHERE status='pending'").fetchone()[0]}, "status_labels": status_labels}


ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = ROOT / "frontend" / "public"
app.mount("/", StaticFiles(directory=FRONTEND_ROOT, html=True), name="frontend")
