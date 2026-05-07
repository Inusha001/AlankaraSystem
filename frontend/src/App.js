import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Toaster, toast } from "sonner";
import logo from "./assets/logo.png";
import { Search, Printer, Mail, Loader2, Sparkles, History } from "lucide-react";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { Card } from "./components/ui/card";
import { InvoicePreview } from "./components/InvoicePreview";
import { PastInvoicesSheet } from "./components/PastInvoicesSheet";
import { saveCustomer, saveInvoice } from "./firebase";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const SHOP_NAME = "Alankara Jewelry";

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
  const [pastOpen, setPastOpen] = useState(false);
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
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;

      if (status === 409 && detail && typeof detail === "object") {
        // Already sold — clear any stale stock data and show a clear warning
        set({
          item: "",
          metal: "",
          metalType: "",
          diamondType: "",
          diamondClarity: "",
          diamondCts: "",
          csType: "",
          csCts: "",
          stockPrice: 0,
        });
        const soldOn = detail.sold_at ? ` on ${detail.sold_at}` : "";
        const buyer = detail.customer_name ? ` to ${detail.customer_name}` : "";
        const inv = detail.invoice_number ? ` (${detail.invoice_number})` : "";
        toast.error("Item is already sold", {
          description: `Sold${buyer}${soldOn}${inv}.`,
          duration: 8000,
        });
      } else {
        const msg =
          (typeof detail === "string" && detail) ||
          detail?.message ||
          "Failed to fetch stock";
        toast.error(msg);
      }
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
        metal_weight: form.metalWeight,
        stock_price: Number(form.stockPrice),
        discount_amount: Number(form.discountAmount),
        discount_percent: Number(form.discountPercent),
        vat_invoice: !!form.vatInvoice,
      };
      const { data } = await axios.post(`${API}/invoices`, payload);
      set({ invoiceNumber: data.invoice_number });

      // Save customer + full invoice to Firebase (best-effort, surface errors)
      let firebaseSaved = false;
      let firebaseError = null;
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
        await saveInvoice(data);
        firebaseSaved = true;
      } catch (fe) {
        firebaseError = fe?.message || String(fe);
        console.warn("Firebase save failed:", fe);
      }

      const parts = [];
      if (data.email_sent) parts.push("emailed to manager");
      if (firebaseSaved) parts.push("synced to Firebase");
      const description = parts.length ? parts.join(" · ") : undefined;

      if (firebaseError) {
        toast.warning(`Invoice ${data.invoice_number} saved locally`, {
          description: `Firebase blocked the save: ${firebaseError}. Update Firestore rules to allow writes.`,
          duration: 8000,
        });
      } else {
        toast.success(`Invoice ${data.invoice_number} saved`, { description });
      }
      setTimeout(() => {
        toast.dismiss();
        window.print();
      }, 300);
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

  const loadPastInvoice = (inv) => {
    setForm({
      customerName: inv.customer_name || "",
      customerEmail: inv.customer_email || "",
      customerPhone: inv.customer_phone || "",
      salesPerson: inv.sales_person || "",
      stockCard: inv.stock_card || "",
      description: inv.description || "",
      item: inv.item || "",
      metal: inv.metal || "",
      metalType: inv.metal_type || "",
      diamondType: inv.diamond_type || "",
      diamondClarity: inv.diamond_clarity || "",
      diamondCts: inv.diamond_cts || "",
      csType: inv.cs_type || "",
      csCts: inv.cs_cts || "",
      metalWeight: inv.metal_weight || "",
      stockPrice: Number(inv.stock_price) || 0,
      discountAmount: Number(inv.discount_amount) || 0,
      discountPercent: Number(inv.discount_percent) || 0,
      vatInvoice: !!inv.vat_invoice,
      invoiceNumber: inv.invoice_number || "INV-—",
    });
    setLastEdited("amount");
    toast.success(`Loaded ${inv.invoice_number}`, {
      description: "Editing this will create a NEW invoice number on save.",
    });
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
            <div className="w-15 h-12 flex items-center justify-center">
              <img src={logo} alt="logo" className="w-15 h-12 object-contain" />
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
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                Live
              </div>
              <div className="font-mono text-[13px]" data-testid="header-datetime">
                {dateTimeStr}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPastOpen(true)}
              data-testid="btn-past-invoices"
              className="ml-2"
            >
              <History className="w-4 h-4 mr-2" />
              Past Invoices
            </Button>
          </div>
        </div>
      </header>

      <PastInvoicesSheet
        open={pastOpen}
        onOpenChange={setPastOpen}
        onSelect={loadPastInvoice}
      />

      {/* Main two-column layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print-root">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          {/* Form */}
          <section className="no-print lg:col-span-5 space-y-6">
            <div>
              <h2 className="font-heading text-3xl tracking-tight text-black-400">New Invoice</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Look up stock, capture customer details, print & email.
              </p>
            </div>

            <Card className="p-6 space-y-4 bg-white/5 backdrop-blur-md border border-white/10 shadow-xl rounded-2xl">
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

            <Card className="p-6 space-y-4 bg-white/5 backdrop-blur-md border border-white/10 shadow-xl rounded-2xl">
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
                <Label htmlFor="metalWeight">Metal Weight</Label>
                <Input
                  id="metalWeight"
                  data-testid="input-metal-weight"
                  value={form.metalWeight}
                  onChange={(e) => set({ metalWeight: e.target.value })}
                  className="mt-2"
                  placeholder="e.g. 4.250 g (leave blank to hide on invoice)"
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

            <Card className="p-6 space-y-4 bg-white/5 backdrop-blur-md border border-white/10 shadow-xl rounded-2xl">
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
      <footer className="no-print border-t border-border mt-10 py-4 text-center text-sm text-muted-foreground">
        <div>
          Developed by <span className="font-medium text-foreground">Inusha Ranasinghe</span>
        </div>
        <div className="mt-1">
          Contact: <span className="font-mono">+94 77 053 2175</span>
        </div>
      </footer>
    </div>
  );
}
