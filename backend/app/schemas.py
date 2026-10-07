from typing import Literal
from pydantic import BaseModel, Field


class MenuItemInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    category: str = Field(min_length=2, max_length=50)
    price: float = Field(gt=0)
    description: str = ""
    dietary_tags: list[str] = []
    allergens: list[str] = []
    preparation_minutes: int = Field(default=20, ge=1, le=180)


class AvailabilityInput(BaseModel):
    available: bool


class OrderLineInput(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=30)
    notes: str = Field(default="", max_length=500)


class OrderCreate(BaseModel):
    order_type: Literal["dine_in", "takeaway"]
    table_id: int | None = None
    notes: str = Field(default="", max_length=500)
    lines: list[OrderLineInput] = Field(min_length=1)


class OrderStatusInput(BaseModel):
    status: Literal["received", "preparing", "ready", "served", "cancelled"]


class PaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    method: Literal["cash", "card", "mobile_money"]
    cashier_name: str = Field(default="Caisse principale", min_length=2, max_length=100)


class LeaveStatusInput(BaseModel):
    status: Literal["approved", "rejected"]


class ReservationCreate(BaseModel):
    table_id: int
    customer_name: str = Field(min_length=2, max_length=100)
    contact: str = Field(min_length=3, max_length=100)
    reserved_at: str
    party_size: int = Field(ge=1, le=30)
    created_by: str = Field(default="Caisse", min_length=2, max_length=100)


class ServerCallCreate(BaseModel):
    table_id: int | None = None
    request_type: Literal["assistance", "bill"]


class ServiceCreate(BaseModel):
    service_date: str
    service_type: Literal["lunch", "dinner"]
    manager_name: str = Field(min_length=2, max_length=100)


class CashOpenCreate(BaseModel):
    service_id: int | None = None
    opening_float: float = Field(ge=0)
    opened_by: str = Field(min_length=2, max_length=100)


class CashCloseCreate(BaseModel):
    actual_total: float = Field(ge=0)


class ShiftCreate(BaseModel):
    employee_id: int
    shift_date: str
    start_time: str
    end_time: str


class WaitTimeRuleCreate(BaseModel):
    min_orders: int = Field(ge=0)
    max_orders: int = Field(ge=0)
    estimated_minutes: int = Field(ge=1, le=180)
    updated_by: str = Field(default="Caisse", min_length=2, max_length=100)


class TableAssignmentInput(BaseModel):
    server_name: str = Field(min_length=2, max_length=100)


class TableCreate(BaseModel):
    capacity: int = Field(ge=1, le=30)


class TableStatusInput(BaseModel):
    status: Literal["free", "occupied", "reserved", "cleaning"]


class TableMergeInput(BaseModel):
    table_ids: list[int] = Field(min_length=2, max_length=50)
    target_table_id: int


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    display_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=256)
    employee_id: int | None = None
    is_super_admin: bool = False
    role: Literal["manager", "server", "cashier"] = "server"


class PermissionGrantsInput(BaseModel):
    permission_codes: list[str]


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=100)
    email: str | None = Field(default=None, min_length=3, max_length=254)
    current_password: str | None = Field(default=None, min_length=8, max_length=256)
    new_password: str | None = Field(default=None, min_length=8, max_length=256)