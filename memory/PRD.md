# Jewelry Shop Invoicing System — PRD

## Original Problem Statement
Make a simple web app for an invoicing system for a Jewelry shop. When user adds stock card number, data should be pulled from a Google Sheet. Invoice has a place to add a description by the user. Date and time must be automatic real-time. Use Google Firebase to store customer data. Data to pull from Google Sheet: Item, Metal, Metal Type, Diamond Type, Diamond Clarity, Diamond CTS, CS Type, CS CTS, Stock Price. Need a discount input with auto-calculated percentage. VAT invoice option that adds 18% to total. Invoice prints: Date/Time, Customer Name, Sales Person name, Stock card number, Description, Metal, Metal Type, Diamond Type, Diamond Clarity, Diamond CTS, CS Type, CS CTS, Stock Price, Discounted Amount, Discount Percentage, Customer Signature. Don't use .NET frameworks. Simple web app.

## Architecture
- **Frontend**: React (CRA) + Tailwind + shadcn/ui + Firebase Web SDK
- **Backend**: FastAPI + Motor (MongoDB) + Resend (email) + Google Sheet CSV (server-side fetch)
- **Data**: 
  - MongoDB → invoices collection, counters collection (sequential invoice numbers)
  - Firebase Firestore → customers collection
  - Google Sheet (published CSV) → live stock catalog

## User Choices Captured
- Google Sheet (published HTML/CSV) — read-only fetch on demand
- Firebase web SDK with provided config (project: invoicingsystem-a5d98)
- No authentication
- Resend API for email delivery
- Manager email: inushar@lankaequities.com
- Customer signs after print (signature line on paper)

## Implemented (2026-04-28)
- Dual-pane invoice creator UI (Swiss/Luxury aesthetic — Cormorant Garamond + Outfit)
- Live A4 invoice preview that updates instantly
- Stock card number → Google Sheet fetch → auto-fill 8 stock fields + price
- Auto live date/time (ticks every second)
- Discount amount ⇄ percent two-way auto-sync
- VAT 18% toggle (live calc in form & preview)
- Auto-incrementing invoice number (INV-00001, INV-00002, …)
- Save invoice to MongoDB + Firestore (customer record)
- Email invoice HTML to manager via Resend (graceful fallback if Resend testing mode blocks)
- Print Invoice via window.print() with @media print CSS (form hides, A4 expands)
- Customer + Authorised Signature lines on print

## Known Limitations / Backlog
### P0
- Resend account is in testing mode → emails to inushar@lankaequities.com will fail until a domain is verified at resend.com/domains. Currently the app gracefully shows "saved" if email fails.
- Google Sheet (AJPL Sales Stock) is currently empty → /api/stock/{card} returns 503. Once the user populates the sheet with columns (Stock Card Number, Item, Metal, Metal Type, Diamond Type, Diamond Clarity, Diamond CTS, CS Type, CS CTS, Stock Price), it works automatically.

### P1 (Future)
- Recent invoices list / search page
- Invoice edit & void
- Manual stock price entry override (when card not in sheet)
- Multi-line invoices (multiple stock cards in one invoice)
- PDF download (jspdf / html2canvas) in addition to print
- Customer database with autocomplete (pull from Firestore)

### P2
- Per-user (sales person) login & sales reports
- Inventory deduction back to the sheet via Sheets API (OAuth)
- Localization (LKR formatting / Sinhala UI)

## Test Status
- Backend pytest: 8/8 passed (health, stock listing, 503 unavailable, invoice math, increments, no-VAT, sorting, email graceful fail)
- Frontend integration: 100% (validation, discount sync, VAT, preview reflects, responsive, datetime tick, fetch error handling)
