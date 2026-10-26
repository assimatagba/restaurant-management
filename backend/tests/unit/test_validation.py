import pytest
from pydantic import ValidationError
from backend.app.database import hash_password
from backend.app.schemas import LeaveRequestCreate, OrderLineInput, ProfileUpdate


def test_password_hash_is_salted_and_repeatable():
    digest, salt = hash_password('test-only-password')
    assert hash_password('test-only-password', salt)[0] == digest
    assert hash_password('different-password', salt)[0] != digest
    assert hash_password('test-only-password')[1] != salt


@pytest.mark.parametrize('value', [0, -1, 31])
def test_order_quantities_reject_invalid_values(value):
    with pytest.raises(ValidationError):
        OrderLineInput(menu_item_id=1, quantity=value)


def test_leave_dates_are_real_calendar_dates():
    with pytest.raises(ValidationError):
        LeaveRequestCreate(start_date='2027-02-30', end_date='2027-03-01', reason='Annual leave')


def test_profile_rejects_empty_names():
    with pytest.raises(ValidationError):
        ProfileUpdate(first_name='')
