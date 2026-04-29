from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import asyncio
import logging
import requests
import resend
import gspread
from google.oauth2.service_account import Credentials as SACredentials
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
MANAGER_EMAIL = os.environ.get('MANAGER_EMAIL', '')
SHOP_NAME = os.environ.get('SHOP_NAME', 'Jewelry Shop')
GOOGLE_SHEET_CSV_URL = os.environ.get('GOOGLE_SHEET_CSV_URL', '')
GOOGLE_SA_JSON_PATH = os.environ.get('GOOGLE_SA_JSON_PATH', '')
STOCK_SHEET_NAME = os.environ.get('STOCK_SHEET_NAME', '')
STOCK_WORKSHEET_NAME = os.environ.get('STOCK_WORKSHEET_NAME', 'Sheet1')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class StockItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stock_card: str
    item: str = ""
    metal: str = ""
    metal_type: str = ""
    diamond_type: str = ""
    diamond_clarity: str = ""
    diamond_cts: str = ""
    cs_type: str = ""
    cs_cts: str = ""
    stock_price: float = 0.0


class InvoiceCreate(BaseModel):
    customer_name: str
    customer_email: Optional[str] = ""
    customer_phone: Optional[str] = ""
    sales_person: str
    stock_card: str
    description: str = ""
    item: str = ""
    metal: str = ""
    metal_type: str = ""
    diamond_type: str = ""
    diamond_clarity: str = ""
    diamond_cts: str = ""
    cs_type: str = ""
    cs_cts: str = ""
    stock_price: float = 0.0
    discount_amount: float = 0.0
    discount_percent: float = 0.0
    vat_invoice: bool = False
    vat_amount: float = 0.0
    subtotal: float = 0.0
    total: float = 0.0


class Invoice(InvoiceCreate):
    invoice_number: str
    created_at: str
    email_sent: bool = False


# ---------- Helpers ----------
def normalize(s: str) -> str:
    return ''.join(c.lower() for c in (s or '') if c.isalnum())


COLUMN_ALIASES = {
    # field -> list of substrings (all lowercased & stripped of non-alnum) that the header should CONTAIN
    'stock_card':      [['stock', 'card'], ['stockno'], ['cardno'], ['cardnumber'], ['stockcardnumer']],
    'item':            [['item'], ['product']],
    'metal_type':      [['metal', 'type']],
    'metal':           [['metal']],
    'diamond_type':    [['diamond', 'type']],
    'diamond_clarity': [['diamond', 'clarity'], ['clarity']],
    'diamond_cts':     [['diamond', 'cts'], ['diamond', 'carat']],
    'cs_type':         [['cs', 'type'], ['colourstonetype'], ['colorstonetype']],
    'cs_cts':          [['cs', 'cts'], ['cs', 'carat']],
    'stock_price':     [['stock', 'price'], ['price']],
}

# Ordered so that multi-token fields (metal_type, diamond_type) get matched BEFORE the
# shorter variants (metal, diamond) that would otherwise swallow them.
_FIELD_ORDER = [
    'stock_card', 'metal_type', 'diamond_type', 'diamond_clarity', 'diamond_cts',
    'cs_type', 'cs_cts', 'stock_price', 'item', 'metal',
]


def map_columns(headers: List[str]) -> dict:
    """Match each field to the first header whose normalized form CONTAINS
    all the required substrings for one of the alias patterns."""
    norm_headers = [normalize(h) for h in headers]
    used_indices: set = set()
    mapping: dict = {}
    for field in _FIELD_ORDER:
        for alias_pattern in COLUMN_ALIASES[field]:
            for i, nh in enumerate(norm_headers):
                if i in used_indices:
                    continue
                if all(tok in nh for tok in alias_pattern):
                    mapping[field] = i
                    used_indices.add(i)
                    break
            if field in mapping:
                break
    return mapping


def fetch_sheet_rows() -> List[dict]:
    """Fetch CSV from Google Sheet and return list of normalized dict rows."""
    if not GOOGLE_SHEET_CSV_URL:
        return []
    try:
        r = requests.get(GOOGLE_SHEET_CSV_URL, timeout=15, allow_redirects=True,
                         headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200 or not r.text.strip():
            logger.warning(f"Sheet fetch returned status={r.status_code} len={len(r.text)}")
            return []
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        if len(rows) < 2:
            return []
        headers = rows[0]
        col_map = map_columns(headers)
        if 'stock_card' not in col_map:
            logger.warning(f"Could not find stock_card column. Headers: {headers}")
            return []
        result = []
        for row in rows[1:]:
            if not any(c.strip() for c in row):
                continue
            obj = {}
            for field, idx in col_map.items():
                val = row[idx] if idx < len(row) else ''
                obj[field] = val.strip()
            result.append(obj)
        return result
    except Exception as e:
        logger.exception(f"Failed to fetch sheet: {e}")
        return []


def parse_price(val: str) -> float:
    if not val:
        return 0.0
    try:
        cleaned = ''.join(c for c in val if c.isdigit() or c in '.-')
        return float(cleaned) if cleaned else 0.0
    except Exception:
        return 0.0


# ---------- Google Sheet write (highlight sold rows) ----------
_gspread_client = None


def _get_gspread_client():
    global _gspread_client
    if _gspread_client is not None:
        return _gspread_client
    if not GOOGLE_SA_JSON_PATH or not Path(GOOGLE_SA_JSON_PATH).exists():
        return None
    try:
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = SACredentials.from_service_account_file(GOOGLE_SA_JSON_PATH, scopes=scopes)
        _gspread_client = gspread.authorize(creds)
        return _gspread_client
    except Exception as e:
        logger.exception(f"Failed to init gspread client: {e}")
        return None


def _highlight_sold_row_sync(stock_card: str) -> dict:
    """Find the row whose Stock Card column matches stock_card and apply
    a light-red fill + strikethrough across the row. Returns a status dict."""
    gc = _get_gspread_client()
    if gc is None:
        return {"ok": False, "reason": "no_credentials"}
    if not STOCK_SHEET_NAME:
        return {"ok": False, "reason": "no_sheet_name"}
    try:
        sh = gc.open(STOCK_SHEET_NAME)
        ws = sh.worksheet(STOCK_WORKSHEET_NAME) if STOCK_WORKSHEET_NAME else sh.sheet1

        all_values = ws.get_all_values()
        if not all_values:
            return {"ok": False, "reason": "empty_sheet"}

        headers = all_values[0]
        col_map = map_columns(headers)
        if 'stock_card' not in col_map:
            return {"ok": False, "reason": "no_stock_card_column"}
        sc_col_idx = col_map['stock_card']
        target = normalize(stock_card)

        # Find matching row (1-indexed; +1 because of header row in 0-indexed loop)
        row_number = None
        for i, row in enumerate(all_values[1:], start=2):
            if sc_col_idx < len(row) and normalize(row[sc_col_idx]) == target:
                row_number = i
                break
        if row_number is None:
            return {"ok": False, "reason": "row_not_found"}

        last_col = len(headers)
        end_a1 = gspread.utils.rowcol_to_a1(row_number, last_col)
        start_a1 = gspread.utils.rowcol_to_a1(row_number, 1)
        rng = f"{start_a1}:{end_a1}"
        ws.format(rng, {
            "backgroundColor": {"red": 0.98, "green": 0.80, "blue": 0.80},
            "textFormat": {"strikethrough": True},
        })
        return {"ok": True, "row": row_number, "range": rng}
    except gspread.exceptions.SpreadsheetNotFound:
        return {"ok": False, "reason": "sheet_not_shared_with_service_account"}
    except Exception as e:
        logger.exception(f"Sheet highlight failed: {e}")
        return {"ok": False, "reason": str(e)}


async def highlight_sold_row(stock_card: str) -> dict:
    return await asyncio.to_thread(_highlight_sold_row_sync, stock_card)


# ---------- Routes ----------
@api_router.get("/sheet-highlight-test/{stock_card}")
async def sheet_highlight_test(stock_card: str):
    """Debug helper — manually trigger the sheet-highlight flow for a stock card."""
    result = await highlight_sold_row(stock_card)
    sa_email = ""
    try:
        import json as _json
        if GOOGLE_SA_JSON_PATH and Path(GOOGLE_SA_JSON_PATH).exists():
            sa_email = _json.loads(Path(GOOGLE_SA_JSON_PATH).read_text()).get("client_email", "")
    except Exception:
        pass
    return {
        "result": result,
        "service_account_email": sa_email,
        "sheet_name": STOCK_SHEET_NAME,
        "worksheet_name": STOCK_WORKSHEET_NAME,
    }


@api_router.get("/")
async def root():
    return {"message": "Jewelry Invoice API", "shop": SHOP_NAME}


@api_router.get("/stock/{stock_card}")
async def get_stock(stock_card: str):
    rows = fetch_sheet_rows()
    if not rows:
        raise HTTPException(status_code=503, detail="Stock data unavailable. Check the Google Sheet has data and is published.")
    target = normalize(stock_card)
    matched = None
    for row in rows:
        if normalize(row.get('stock_card', '')) == target:
            matched = row
            break
    if not matched:
        raise HTTPException(status_code=404, detail=f"Stock card '{stock_card}' not found")

    item = StockItem(
        stock_card=matched.get('stock_card', stock_card),
        item=matched.get('item', ''),
        metal=matched.get('metal', ''),
        metal_type=matched.get('metal_type', ''),
        diamond_type=matched.get('diamond_type', ''),
        diamond_clarity=matched.get('diamond_clarity', ''),
        diamond_cts=matched.get('diamond_cts', ''),
        cs_type=matched.get('cs_type', ''),
        cs_cts=matched.get('cs_cts', ''),
        stock_price=parse_price(matched.get('stock_price', '0')),
    )

    # Check if this stock card has already been sold
    sold = await db.invoices.find_one(
        {"stock_card": item.stock_card},
        {"_id": 0, "invoice_number": 1, "customer_name": 1, "created_at": 1},
    )
    if sold:
        # 409 Conflict — frontend will show "Item is already sold"
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Item is already sold",
                "invoice_number": sold.get("invoice_number"),
                "customer_name": sold.get("customer_name"),
                "sold_at": sold.get("created_at"),
                "item": item.model_dump(),
            },
        )

    return item


@api_router.get("/stock")
async def list_stock():
    """Debug helper: list all stock card numbers found in the sheet."""
    rows = fetch_sheet_rows()
    return {"count": len(rows), "items": [r.get('stock_card', '') for r in rows]}


async def _send_invoice_email(invoice: Invoice) -> bool:
    if not MANAGER_EMAIL or not resend.api_key:
        return False
    html = render_invoice_html(invoice)
    params = {
        "from": SENDER_EMAIL,
        "to": [MANAGER_EMAIL],
        "subject": f"New Invoice {invoice.invoice_number} - {invoice.customer_name}",
        "html": html,
    }
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logger.error(f"Resend email failed: {e}")
        return False


def render_invoice_html(inv: Invoice) -> str:
    rows_html = ""
    fields = [
        ("Item", inv.item),
        ("Metal", inv.metal),
        ("Metal Type", inv.metal_type),
        ("Diamond Type", inv.diamond_type),
        ("Diamond Clarity", inv.diamond_clarity),
        ("Diamond CTS", inv.diamond_cts),
        ("CS Type", inv.cs_type),
        ("CS CTS", inv.cs_cts),
    ]
    for k, v in fields:
        if v:
            rows_html += f'<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px;">{k}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;">{v}</td></tr>'
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;">
      <table width="100%" style="border-collapse:collapse;">
        <tr><td style="padding-bottom:16px;border-bottom:2px solid #111;">
          <h1 style="margin:0;font-size:24px;letter-spacing:2px;">{SHOP_NAME}</h1>
          <div style="color:#888;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-top:4px;">Tax Invoice</div>
        </td></tr>
        <tr><td style="padding-top:20px;">
          <table width="100%" style="border-collapse:collapse;font-size:13px;">
            <tr>
              <td style="vertical-align:top;width:50%;">
                <div style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Invoice No.</div>
                <div style="font-size:16px;font-weight:600;">{inv.invoice_number}</div>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <div style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Date</div>
                <div>{inv.created_at}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:20px;">
          <table width="100%" style="border-collapse:collapse;font-size:13px;">
            <tr>
              <td style="vertical-align:top;width:50%;">
                <div style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Bill To</div>
                <div style="font-weight:600;">{inv.customer_name}</div>
                {f'<div>{inv.customer_email}</div>' if inv.customer_email else ''}
                {f'<div>{inv.customer_phone}</div>' if inv.customer_phone else ''}
              </td>
              <td style="vertical-align:top;text-align:right;">
                <div style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Sales Person</div>
                <div>{inv.sales_person}</div>
                <div style="margin-top:8px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Stock Card</div>
                <div>{inv.stock_card}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:20px;">
          <div style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">Item Details</div>
          <table width="100%" style="border-collapse:collapse;border:1px solid #eee;">
            {rows_html}
          </table>
          {f'<p style="margin-top:12px;font-size:13px;color:#444;"><b>Description:</b> {inv.description}</p>' if inv.description else ''}
        </td></tr>
        <tr><td style="padding-top:24px;">
          <table width="100%" style="border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:6px 0;color:#666;">Subtotal</td><td style="padding:6px 0;text-align:right;">{inv.stock_price:,.2f}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Discount ({inv.discount_percent:.2f}%)</td><td style="padding:6px 0;text-align:right;">- {inv.discount_amount:,.2f}</td></tr>
            {f'<tr><td style="padding:6px 0;color:#666;">VAT (18%)</td><td style="padding:6px 0;text-align:right;">{inv.vat_amount:,.2f}</td></tr>' if inv.vat_invoice else ''}
            <tr><td style="padding:10px 0;border-top:2px solid #111;font-weight:700;font-size:16px;">Total</td><td style="padding:10px 0;border-top:2px solid #111;text-align:right;font-weight:700;font-size:16px;">{inv.total:,.2f}</td></tr>
          </table>
        </td></tr>
      </table>
    </div>
    """


@api_router.get("/invoices/next-number")
async def next_invoice_number():
    """Peek at the next invoice number without incrementing the counter."""
    doc = await db.counters.find_one({"_id": "invoice"}, {"_id": 0})
    current = (doc or {}).get("seq", 0)
    return {"invoice_number": f"INV-{current + 1:05d}"}


@api_router.post("/invoices", response_model=Invoice)
async def create_invoice(payload: InvoiceCreate):
    # Compute totals server-side as canonical
    subtotal = max(payload.stock_price - payload.discount_amount, 0.0)
    vat_amount = round(subtotal * 0.18, 2) if payload.vat_invoice else 0.0
    total = round(subtotal + vat_amount, 2)
    discount_percent = (payload.discount_amount / payload.stock_price * 100.0) if payload.stock_price > 0 else 0.0

    # Generate sequential invoice number
    counter_doc = await db.counters.find_one_and_update(
        {"_id": "invoice"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = counter_doc.get("seq", 1) if counter_doc else 1
    invoice_number = f"INV-{seq:05d}"

    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    payload_dict = payload.model_dump()
    payload_dict.update({
        "subtotal": round(subtotal, 2),
        "vat_amount": vat_amount,
        "total": total,
        "discount_percent": round(discount_percent, 2),
    })
    invoice = Invoice(
        **payload_dict,
        invoice_number=invoice_number,
        created_at=created_at,
        email_sent=False,
    )

    # Send email (non-blocking via thread)
    email_sent = await _send_invoice_email(invoice)
    invoice.email_sent = email_sent

    # Highlight the sold row in the Google Sheet (best-effort, non-blocking failure)
    sheet_result = await highlight_sold_row(invoice.stock_card)
    if not sheet_result.get("ok"):
        logger.warning(f"Sheet highlight skipped: {sheet_result.get('reason')}")

    # Save to MongoDB (exclude _id to avoid serialization issues)
    doc = invoice.model_dump()
    doc["sheet_highlight"] = sheet_result
    await db.invoices.insert_one(doc)
    return invoice


@api_router.get("/invoices", response_model=List[Invoice])
async def list_invoices():
    invoices = await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return invoices


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
