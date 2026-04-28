"""Backend API tests for Jewelry Shop Invoicing System."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sparkle-bill-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_root_returns_shop_name(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert "shop" in data
        assert data["shop"] == "AJPL Jewelry"
        assert "message" in data


# ---------- Stock endpoints ----------
class TestStock:
    def test_list_stock_empty_sheet(self, session):
        r = session.get(f"{API}/stock")
        assert r.status_code == 200
        data = r.json()
        assert "count" in data
        assert "items" in data
        assert isinstance(data["items"], list)
        # Sheet is empty per problem statement
        assert data["count"] == 0

    def test_get_stock_unavailable_or_notfound(self, session):
        r = session.get(f"{API}/stock/ANY-CARD-001")
        # Sheet is empty → 503; otherwise must be 404 when not present
        assert r.status_code in (503, 404)
        data = r.json()
        assert "detail" in data
        assert isinstance(data["detail"], str) and len(data["detail"]) > 0


# ---------- Invoice CRUD & math ----------
class TestInvoices:
    def test_create_invoice_math_and_persistence(self, session):
        payload = {
            "customer_name": "TEST_Jane Doe",
            "customer_email": "test_jane@example.com",
            "customer_phone": "+94770000000",
            "sales_person": "TEST_Sales",
            "stock_card": "TEST-SC-001",
            "description": "Test description",
            "item": "Ring",
            "metal": "Gold",
            "metal_type": "18K",
            "stock_price": 150000,
            "discount_amount": 15000,
            "discount_percent": 10,
            "vat_invoice": True,
        }
        r = session.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, f"body: {r.text}"
        inv = r.json()

        # Totals validation:
        # subtotal = 150000 - 15000 = 135000
        # vat = 135000 * 0.18 = 24300
        # total = 159300
        assert inv["subtotal"] == 135000.0 or inv["subtotal"] == 135000
        assert inv["vat_amount"] == 24300.0 or inv["vat_amount"] == 24300
        assert inv["total"] == 159300.0 or inv["total"] == 159300
        assert inv["discount_percent"] == 10.0

        # Invoice number format
        assert inv["invoice_number"].startswith("INV-")
        assert len(inv["invoice_number"]) == 9  # INV-00001

        # Email: in testing mode, Resend cannot deliver to external → False expected
        assert isinstance(inv["email_sent"], bool)

        # Persistence: list invoices and find it
        r2 = session.get(f"{API}/invoices")
        assert r2.status_code == 200
        lst = r2.json()
        assert isinstance(lst, list)
        # No _id leak
        for x in lst:
            assert "_id" not in x
        assert any(x["invoice_number"] == inv["invoice_number"] for x in lst)

    def test_invoice_number_increments(self, session):
        p = {
            "customer_name": "TEST_IncA",
            "sales_person": "TEST_Sales",
            "stock_card": "TEST-CARD-A",
            "stock_price": 1000,
        }
        r1 = session.post(f"{API}/invoices", json=p)
        assert r1.status_code == 200
        n1 = int(r1.json()["invoice_number"].split("-")[1])

        p["customer_name"] = "TEST_IncB"
        r2 = session.post(f"{API}/invoices", json=p)
        assert r2.status_code == 200
        n2 = int(r2.json()["invoice_number"].split("-")[1])

        assert n2 == n1 + 1

    def test_invoice_no_vat(self, session):
        p = {
            "customer_name": "TEST_NoVat",
            "sales_person": "TEST_Sales",
            "stock_card": "TEST-NV-001",
            "stock_price": 50000,
            "discount_amount": 5000,
            "vat_invoice": False,
        }
        r = session.post(f"{API}/invoices", json=p)
        assert r.status_code == 200
        d = r.json()
        assert d["subtotal"] == 45000
        assert d["vat_amount"] == 0
        assert d["total"] == 45000

    def test_list_invoices_sorted_desc(self, session):
        r = session.get(f"{API}/invoices")
        assert r.status_code == 200
        invs = r.json()
        if len(invs) >= 2:
            # created_at strings sortable lexicographically (YYYY-MM-DD HH:MM:SS UTC)
            assert invs[0]["created_at"] >= invs[1]["created_at"]

    def test_email_graceful_failure_invoice_saved(self, session):
        """Resend testing mode → email_sent=false but invoice persisted."""
        p = {
            "customer_name": "TEST_EmailFail",
            "sales_person": "TEST_Sales",
            "stock_card": "TEST-EF-001",
            "stock_price": 10000,
        }
        r = session.post(f"{API}/invoices", json=p)
        assert r.status_code == 200
        d = r.json()
        # Must still have invoice number & be in list
        inv_num = d["invoice_number"]
        r2 = session.get(f"{API}/invoices")
        assert any(x["invoice_number"] == inv_num for x in r2.json())
