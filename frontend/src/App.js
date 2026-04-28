import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { Search, Printer, Mail, Loader2, Sparkles } from "lucide-react";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { Card } from "./components/ui/card";
import { InvoicePreview } from "./components/InvoicePreview";
import { saveCustomer } from "./firebase";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const SHOP_NAME = "AJPL Jewelry";

function useLiveDateTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatDateTime(d) {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

const initialForm = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  salesPerson: "",
  stockCard: "",
  description: "",
  item: "",
  metal: "",
  metalType: "",
  diamondType: "",
  diamondClarity: "",
  diamondCts: "",
  csType: "",
  csCts: "",
  stockPrice: 0,
  discountAmount: 0,
  discountPercent: 0,
  vatInvoice: false,
  invoiceNumber: "INV-—",
};

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastEdited, setLastEdited] = useState("amount"); // "amount" or "percent"
  const now = useLiveDateTime();
  const dateTimeStr = formatDateTime(now);

  // Fetch next invoice number on mount so the preview shows the real number live
  useEffect(() => {
    let mounted = true;
    axios
      .get(`${API}/invoices/next-number`)
      .then(({ data }) => {
        if (mounted && data?.invoice_number) {
          setForm((f) => ({ ...f, invoiceNumber: data.invoice_number }));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    const price = Number(form.stockPrice) || 0;
    const disc = Number(form.discountAmount) || 0;
    const subtotal = Math.max(price - disc, 0);
    const vat = form.vatInvoice ? +(subtotal * 0.18).toFixed(2) : 0;
    const total = +(subtotal + vat).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), vat, total };
  }, [form.stockPrice, form.discountAmount, form.vatInvoice]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Discount sync: when stockPrice or discountAmount changes & last edit was amount → recompute %
  useEffect(() => {
    const price = Number(form.stockPrice) || 0;
    if (lastEdited === "amount") {
      const pct = price > 0 ? (Number(form.discountAmount) / price) * 100 : 0;
      setForm((f) => ({ ...f, discountPercent: +pct.toFixed(2) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.discountAmount, form.stockPrice]);

  const onPercentChange = (v) => {
    const pct = Math.min(Math.max(Number(v) || 0, 0), 100);
    const price = Number(form.stockPrice) || 0;
    const amount = +((price * pct) / 100).toFixed(2);
    setLastEdited("percent");
    set({ discountPercent: pct, discountAmount: amount });
  };

  const onAmountChange = (v) => {
    const amt = Math.max(Number(v) || 0, 0);
    setLastEdited("amount");
    set({ discountAmount: amt });
  };

  const fetchStock = async () => {
    if (!form.stockCard.trim()) {
      toast.error("Enter a stock card number first");
      return;
    }
    setFetching(true);
    try {
      const { data } = await axios.get(
        `${API}/stock/${encodeURIComponent(form.stockCard.trim())}`
      );
      set({
        item: data.item || "",
        metal: data.metal || "",
        metalType: data.metal_type || "",
        diamondType: data.diamond_type || "",
        diamondClarity: data.diamond_clarity || "",
        diamondCts: data.diamond_cts || "",
        csType: data.cs_type || "",
        csCts: data.cs_cts || "",
        stockPrice: Number(data.stock_price) || 0,
      });
      toast.success("Stock data loaded");
    } catch (e) {
      const msg = e?.response?.data?.detail || "Failed to fetch stock";
      toast.error(msg);
    } finally {
      setFetching(false);
    }
  };

  const validate = () => {
    if (!form.customerName.trim()) return "Customer name is required";
    if (!form.salesPerson.trim()) return "Sales person name is required";
    if (!form.stockCard.trim()) return "Stock card number is required";
    if (!Number(form.stockPrice)) return "Stock price must be greater than 0";
    return null;
  };

  const saveAndPrint = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customer_name: form.customerName.trim(),
        customer_email: form.customerEmail.trim(),
        customer_phone: form.customerPhone.trim(),
        sales_person: form.salesPerson.trim(),
        stock_card: form.stockCard.trim(),
        description: form.description.trim(),
        item: form.item,
        metal: form.metal,
        metal_type: form.metalType,
        diamond_type: form.diamondType,
        diamond_clarity: form.diamondClarity,
        diamond_cts: form.diamondCts,
        cs_type: form.csType,
        cs_cts: form.csCts,
        stock_price: Number(form.stockPrice),
        discount_amount: Number(form.discountAmount),
        discount_percent: Number(form.discountPercent),
        vat_invoice: !!form.vatInvoice,
      };
      const { data } = await axios.post(`${API}/invoices`, payload);
      set({ invoiceNumber: data.invoice_number });

      // Save customer to Firebase (best-effort, non-blocking failure)
      try {
        await saveCustomer({
          name: data.customer_name,
          email: data.customer_email || "",
          phone: data.customer_phone || "",
          sales_person: data.sales_person,
          invoice_number: data.invoice_number,
          stock_card: data.stock_card,
          total: data.total,
        });
      } catch (fe) {
        console.warn("Firebase save failed", fe);
      }

      if (data.email_sent) {
        toast.success(`Invoice ${data.invoice_number} saved & emailed to manager`);
      } else {
        toast.success(`Invoice ${data.invoice_number} saved`, {
          description: "Email could not be sent — check Resend config",
        });
      }
      // Trigger print after a small delay so the preview updates
      setTimeout(() => window.print(), 400);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save invoice", {
        description: e?.response?.data?.detail || e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const printOnly = () => window.print();

  const newInvoice = () => {
    setForm(initialForm);
    setLastEdited("amount");
    // Refresh next invoice number
    axios
      .get(`${API}/invoices/next-number`)
      .then(({ data }) => {
        if (data?.invoice_number) {
          setForm((f) => ({ ...f, invoiceNumber: data.invoice_number }));
        }
      })
      .catch(() => {});
  };

  const previewInvoice = {
    ...form,
    invoiceNumber: form.invoiceNumber || "INV-—",
  };

  return (
    <div className="App min-h-screen">
      <Toaster position="top-right" richColors />

      {/* Top Bar */}
      <header className="no-print border-b border-border bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-foreground text-background flex items-center justify-center">
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div>
              <div className="font-heading font-semibold text-xl tracking-tight leading-none">
                {SHOP_NAME}
              </div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mt-1">
                Invoicing System
              </div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
              Live
            </div>
            <div className="font-mono text-[13px]" data-testid="header-datetime">
              {dateTimeStr}
            </div>
          </div>
        </div>
      </header>

      {/* Main two-column layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print-root">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Form */}
          <section className="no-print lg:col-span-5 space-y-6">
            <div>
              <h2 className="font-heading text-3xl tracking-tight">New Invoice</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Look up stock, capture customer details, print & email.
              </p>
            </div>

            <Card className="p-6 space-y-4">
              <div>
                <Label htmlFor="stockCard" className="text-xs uppercase tracking-widest">
                  Stock Card Number
                </Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="stockCard"
                    data-testid="input-stock-card"
                    value={form.stockCard}
                    onChange={(e) => set({ stockCard: e.target.value })}
                    placeholder="e.g. SC-001"
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    onClick={fetchStock}
                    disabled={fetching}
                    data-testid="btn-fetch-stock"
                    className="shrink-0"
                  >
                    {fetching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="ml-2">Fetch</span>
                  </Button>
                </div>
              </div>

              {form.item && (
                <div className="rounded-sm bg-secondary p-3 text-xs space-y-0.5 animate-fade-in-up">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Item</span>
                    <span className="font-medium">{form.item}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock Price</span>
                    <span className="font-mono">
                      {Number(form.stockPrice).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-6 space-y-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Customer
              </div>
              <div>
                <Label htmlFor="custName">Customer Name *</Label>
                <Input
                  id="custName"
                  data-testid="input-customer-name"
                  value={form.customerName}
                  onChange={(e) => set({ customerName: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="custEmail">Email</Label>
                  <Input
                    id="custEmail"
                    data-testid="input-customer-email"
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => set({ customerEmail: e.target.value })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="custPhone">Phone</Label>
                  <Input
                    id="custPhone"
                    data-testid="input-customer-phone"
                    value={form.customerPhone}
                    onChange={(e) => set({ customerPhone: e.target.value })}
                    className="mt-2"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="sp">Sales Person Name *</Label>
                <Input
                  id="sp"
                  data-testid="input-sales-person"
                  value={form.salesPerson}
                  onChange={(e) => set({ salesPerson: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  data-testid="input-description"
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  rows={3}
                  className="mt-2 resize-none"
                  placeholder="Notes about this sale..."
                />
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Pricing
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="discAmt">Discount Amount</Label>
                  <Input
                    id="discAmt"
                    data-testid="input-discount-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.discountAmount}
                    onChange={(e) => onAmountChange(e.target.value)}
                    className="mt-2 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="discPct">Discount %</Label>
                  <Input
                    id="discPct"
                    data-testid="input-discount-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.discountPercent}
                    onChange={(e) => onPercentChange(e.target.value)}
                    className="mt-2 font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <Label htmlFor="vat" className="cursor-pointer">
                    VAT Invoice (18%)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Adds 18% VAT to the total
                  </p>
                </div>
                <Switch
                  id="vat"
                  data-testid="switch-vat"
                  checked={form.vatInvoice}
                  onCheckedChange={(v) => set({ vatInvoice: v })}
                />
              </div>

              <div className="rounded-sm bg-foreground text-background p-4 mt-2">
                <div className="flex justify-between text-xs uppercase tracking-widest opacity-70">
                  <span>Total</span>
                  <span>LKR</span>
                </div>
                <div
                  className="font-heading text-3xl mt-1 font-medium"
                  data-testid="form-total"
                >
                  {totals.total.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={saveAndPrint}
                disabled={saving}
                data-testid="btn-save-print"
                className="flex-1 h-11"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                <span className="ml-2">Save, Email & Print</span>
              </Button>
              <Button
                variant="outline"
                onClick={printOnly}
                data-testid="btn-print-only"
                className="h-11"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button
                variant="ghost"
                onClick={newInvoice}
                data-testid="btn-new"
                className="h-11"
              >
                New
              </Button>
            </div>
          </section>

          {/* Preview */}
          <section className="lg:col-span-7">
            <div className="no-print mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Live Preview
            </div>
            <InvoicePreview
              invoice={previewInvoice}
              dateTime={dateTimeStr}
              totals={totals}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
