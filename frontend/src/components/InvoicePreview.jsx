import React from "react";

export const InvoicePreview = React.forwardRef(function InvoicePreview(
  { invoice, dateTime, totals },
  ref
) {
  const {
    invoiceNumber,
    customerName,
    customerEmail,
    customerPhone,
    salesPerson,
    stockCard,
    description,
    item,
    metal,
    metalType,
    diamondType,
    diamondClarity,
    diamondCts,
    csType,
    csCts,
    stockPrice,
    discountAmount,
    discountPercent,
    vatInvoice,
  } = invoice;

  const fmt = (n) =>
    Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const detailRows = [
    ["Item", item],
    ["Metal", metal],
    ["Metal Type", metalType],
    ["Diamond Type", diamondType],
    ["Diamond Clarity", diamondClarity],
    ["Diamond CTS", diamondCts],
    ["CS Type", csType],
    ["CS CTS", csCts],
  ];

  return (
    <div
      ref={ref}
      data-testid="invoice-preview"
      className="print-area bg-white border border-border shadow-[0_8px_30px_rgb(0,0,0,0.08)] mx-auto"
      style={{
        // A5 at 96 DPI: 148mm x 210mm ≈ 559 x 794px. We show a slightly smaller on-screen preview.
        maxWidth: "460px",
        minHeight: "653px",
        aspectRatio: "1 / 1.414",
        // Leave the pre-printed logo area (top ~12%) and footer band (~8%) blank
        paddingTop: "90px",
        paddingLeft: "28px",
        paddingRight: "28px",
        paddingBottom: "60px",
      }}
    >
      {/* Invoice number + date row — NO shop name (pre-printed on paper) */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-0.5">
            Invoice No.
          </div>
          <div
            className="font-semibold"
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: "18px",
              letterSpacing: "0.5px",
            }}
            data-testid="preview-invoice-number"
          >
            {invoiceNumber}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-0.5">
            Date / Time
          </div>
          <div
            style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: "13px" }}
            data-testid="preview-datetime"
          >
            {dateTime}
          </div>
        </div>
      </div>

      {/* Customer + Sales person */}
      <div className="grid grid-cols-2 gap-4 mt-5 text-[11px]">
        <div>
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
            Bill To
          </div>
          <div className="font-semibold text-[12px]" data-testid="preview-customer-name">
            {customerName || "—"}
          </div>
          {customerEmail && <div className="text-muted-foreground">{customerEmail}</div>}
          {customerPhone && <div className="text-muted-foreground">{customerPhone}</div>}
        </div>
        <div className="text-right">
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
            Sales Person
          </div>
          <div>{salesPerson || "—"}</div>
          <div className="mt-2 text-[9px] tracking-[0.25em] text-muted-foreground uppercase">
            Stock Card
          </div>
          <div className="font-mono text-[12px]" data-testid="preview-stock-card">
            {stockCard || "—"}
          </div>
        </div>
      </div>

      {/* Description (above Item Details) */}
      {description && (
        <div className="mt-5">
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
            Description
          </div>
          <div className="text-[11px]">{description}</div>
        </div>
      )}

      {/* Item details */}
      <div className="mt-5">
        <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-2">
          Item Details
        </div>
        <table className="w-full text-[11px] border border-border">
          <tbody>
            {detailRows.map(([k, v]) => (
              <tr key={k} className="border-b border-border last:border-b-0">
                <td className="py-1 px-2.5 text-muted-foreground w-2/5">{k}</td>
                <td className="py-1 px-2.5">{v || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mt-5 ml-auto" style={{ maxWidth: "260px" }}>
        <table className="w-full text-[11px]">
          <tbody>
            <tr>
              <td className="py-0.5 text-muted-foreground">Stock Price</td>
              <td className="py-0.5 text-right">{fmt(stockPrice)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-muted-foreground">
                Discount ({Number(discountPercent || 0).toFixed(2)}%)
              </td>
              <td className="py-0.5 text-right">- {fmt(discountAmount)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-muted-foreground">Discounted Amount</td>
              <td className="py-0.5 text-right">{fmt(totals.subtotal)}</td>
            </tr>
            {vatInvoice && (
              <tr>
                <td className="py-0.5 text-muted-foreground">VAT (18%)</td>
                <td className="py-0.5 text-right">{fmt(totals.vat)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-foreground">
              <td className="py-1.5 font-bold text-[13px]">Total</td>
              <td
                className="py-1.5 text-right font-bold text-[13px]"
                data-testid="preview-total"
              >
                {fmt(totals.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signature */}
      <div className="mt-10 grid grid-cols-2 gap-6">
        <div>
          <div className="border-t border-foreground pt-1 text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
            Customer Signature
          </div>
        </div>
        <div>
          <div className="border-t border-foreground pt-1 text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
            Authorised Signature
          </div>
        </div>
      </div>
    </div>
  );
});
