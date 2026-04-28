import React from "react";

export const InvoicePreview = React.forwardRef(function InvoicePreview(
  { invoice, shopName, dateTime, totals },
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
      className="print-area bg-white border border-border shadow-[0_8px_30px_rgb(0,0,0,0.08)] mx-auto p-10 sm:p-12"
      style={{
        maxWidth: "595px",
        minHeight: "842px",
        aspectRatio: "1 / 1.414",
      }}
    >
      {/* Header */}
      <div className="flex items-end justify-between border-b border-foreground pb-5">
        <div>
          <h1
            className="font-heading font-medium tracking-tight text-foreground"
            style={{ fontSize: "32px", lineHeight: 1 }}
          >
            {shopName}
          </h1>
          <div className="mt-1 text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
            {vatInvoice ? "VAT Invoice" : "Sales Invoice"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
            Invoice
          </div>
          <div
            className="font-heading font-semibold"
            style={{ fontSize: "20px" }}
            data-testid="preview-invoice-number"
          >
            {invoiceNumber}
          </div>
        </div>
      </div>

      {/* Date & Customer */}
      <div className="grid grid-cols-2 gap-6 mt-6 text-[12px]">
        <div>
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
            Bill To
          </div>
          <div className="font-semibold text-[13px]" data-testid="preview-customer-name">
            {customerName || "—"}
          </div>
          {customerEmail && <div className="text-muted-foreground">{customerEmail}</div>}
          {customerPhone && <div className="text-muted-foreground">{customerPhone}</div>}
        </div>
        <div className="text-right">
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
            Date / Time
          </div>
          <div data-testid="preview-datetime">{dateTime}</div>
          <div className="mt-2 text-[9px] tracking-[0.25em] text-muted-foreground uppercase">
            Sales Person
          </div>
          <div>{salesPerson || "—"}</div>
        </div>
      </div>

      {/* Stock card */}
      <div className="mt-6">
        <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
          Stock Card
        </div>
        <div className="font-mono text-[13px]" data-testid="preview-stock-card">
          {stockCard || "—"}
        </div>
      </div>

      {/* Description (above item details) */}
      {description && (
        <div className="mt-6">
          <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-1">
            Description
          </div>
          <div className="text-[12px]">{description}</div>
        </div>
      )}

      {/* Item details */}
      <div className="mt-6">
        <div className="text-[9px] tracking-[0.25em] text-muted-foreground uppercase mb-2">
          Item Details
        </div>
        <table className="w-full text-[12px] border border-border">
          <tbody>
            {detailRows.map(([k, v]) => (
              <tr key={k} className="border-b border-border last:border-b-0">
                <td className="py-1.5 px-3 text-muted-foreground w-2/5">{k}</td>
                <td className="py-1.5 px-3">{v || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mt-6 ml-auto" style={{ maxWidth: "320px" }}>
        <table className="w-full text-[12px]">
          <tbody>
            <tr>
              <td className="py-1 text-muted-foreground">Stock Price</td>
              <td className="py-1 text-right">{fmt(stockPrice)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">
                Discount ({Number(discountPercent || 0).toFixed(2)}%)
              </td>
              <td className="py-1 text-right">- {fmt(discountAmount)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">Discounted Amount</td>
              <td className="py-1 text-right">{fmt(totals.subtotal)}</td>
            </tr>
            {vatInvoice && (
              <tr>
                <td className="py-1 text-muted-foreground">VAT (18%)</td>
                <td className="py-1 text-right">{fmt(totals.vat)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-foreground">
              <td className="py-2 font-bold text-[14px]">Total</td>
              <td
                className="py-2 text-right font-bold text-[14px]"
                data-testid="preview-total"
              >
                {fmt(totals.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signature */}
      <div className="mt-16 grid grid-cols-2 gap-8">
        <div>
          <div className="border-t border-foreground pt-1 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            Customer Signature
          </div>
        </div>
        <div>
          <div className="border-t border-foreground pt-1 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            Authorised Signature
          </div>
        </div>
      </div>

      <div className="mt-8 text-center text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
        Thank you for your business
      </div>
    </div>
  );
});
