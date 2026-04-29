import { useEffect, useState } from "react";
import { Loader2, RotateCw, AlertCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import { Button } from "./ui/button";
import { fetchRecentInvoices } from "../firebase";

export function PastInvoicesSheet({ open, onOpenChange, onSelect }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invoices, setInvoices] = useState([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchRecentInvoices(100);
      setInvoices(list);
    } catch (e) {
      setError(e?.message || "Failed to load invoices from Firebase");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const fmt = (n) =>
    Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const dateOf = (inv) => {
    const ts = inv.saved_at;
    if (ts && typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    if (inv.created_at) return inv.created_at;
    return "—";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
        data-testid="past-invoices-sheet"
      >
        <SheetHeader>
          <SheetTitle className="font-heading text-2xl">Past Invoices</SheetTitle>
          <SheetDescription>
            Pulled live from Firebase Firestore (most recent first).
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : error
              ? "Error"
              : `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="btn-refresh-past"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCw className="w-3 h-3" />
            )}
            <span className="ml-2 text-xs">Refresh</span>
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive mb-1">
                  Couldn&apos;t reach Firebase
                </div>
                <div className="text-muted-foreground">{error}</div>
                <div className="mt-2 text-muted-foreground">
                  Most likely cause: Firestore security rules block reads. See the
                  toast notice or update the rules in your Firebase console.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {!loading && !error && invoices.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-12">
              No invoices saved yet.
            </div>
          )}
          {invoices.map((inv) => (
            <button
              key={inv._docId}
              onClick={() => {
                onSelect && onSelect(inv);
                onOpenChange(false);
              }}
              className="w-full text-left rounded-sm border border-border hover:border-foreground transition-colors p-3 group"
              data-testid={`past-invoice-${inv.invoice_number || inv._docId}`}
            >
              <div className="flex items-baseline justify-between">
                <div
                  className="font-semibold text-sm"
                  style={{ fontFamily: '"Times New Roman", Times, serif' }}
                >
                  {inv.invoice_number || "—"}
                  {inv.vat_invoice && (
                    <span className="ml-2 text-[9px] tracking-widest uppercase text-accent">
                      Tax
                    </span>
                  )}
                </div>
                <div className="font-mono text-sm">{fmt(inv.total)}</div>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between text-xs">
                <div className="text-foreground/80 truncate pr-2">
                  {inv.customer_name || "—"}
                </div>
                <div className="text-muted-foreground shrink-0">{dateOf(inv)}</div>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {inv.item} · {inv.stock_card} · by {inv.sales_person || "—"}
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
