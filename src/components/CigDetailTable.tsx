import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";

import { formatCurrency } from "@/lib/format";

interface CigRow {
  cig: string;
  vendite: number;
  acquisti: number;
  saldo: number;
  nVendite: number;
  nAcquisti: number;
}

function makeColumns(onCigClick: (cig: string) => void): ColumnDef<CigRow>[] {
  return [
    {
      key: "cig", label: "CIG", sortable: true, filterable: true,
      render: (r) => (
        <span
          className="font-mono text-xs text-primary underline decoration-dotted cursor-pointer hover:text-primary/80"
          onClick={(e) => { e.stopPropagation(); onCigClick(r.cig); }}
        >{r.cig}</span>
      ),
    },
    { key: "vendite", label: "Vendite", render: (r) => <span className="text-xs font-mono text-income">{formatCurrency(r.vendite)}</span>, sortable: true, align: "right" },
    { key: "nVendite", label: "N° Fatt. V.", render: (r) => <span className="text-xs text-right block">{r.nVendite}</span>, sortable: true, align: "right" },
    { key: "acquisti", label: "Acquisti", render: (r) => <span className="text-xs font-mono text-expense">{formatCurrency(r.acquisti)}</span>, sortable: true, align: "right" },
    { key: "nAcquisti", label: "N° Fatt. A.", render: (r) => <span className="text-xs text-right block">{r.nAcquisti}</span>, sortable: true, align: "right" },
    {
      key: "saldo", label: "Saldo", sortable: true, align: "right",
      render: (r) => (
        <span className={`text-xs font-mono font-semibold ${r.saldo >= 0 ? "text-income" : "text-expense"}`}>
          {formatCurrency(r.saldo)}
        </span>
      ),
    },
  ];
}

export function CigDetailTable({ sales, purchases }: { sales: SaleInvoice[]; purchases: PurchaseInvoice[] }) {
  const navigate = useNavigate();
  const columns = useMemo(() => makeColumns((cig) => navigate(`/commesse?cig=${encodeURIComponent(cig)}`)), [navigate]);

  const rows = useMemo(() => {
    const map: Record<string, CigRow> = {};
    sales.forEach((s) => {
      if (!s.cig) return;
      if (!map[s.cig]) map[s.cig] = { cig: s.cig, vendite: 0, acquisti: 0, saldo: 0, nVendite: 0, nAcquisti: 0 };
      map[s.cig].vendite += s.totale;
      map[s.cig].nVendite++;
    });
    purchases.forEach((p) => {
      if (!p.cig) return;
      if (!map[p.cig]) map[p.cig] = { cig: p.cig, vendite: 0, acquisti: 0, saldo: 0, nVendite: 0, nAcquisti: 0 };
      map[p.cig].acquisti += p.totale;
      map[p.cig].nAcquisti++;
    });
    return Object.values(map)
      .map((r) => ({ ...r, saldo: r.vendite - r.acquisti }))
      .sort((a, b) => b.vendite + b.acquisti - (a.vendite + a.acquisti));
  }, [sales, purchases]);

  return <DataTable<CigRow> columns={columns} data={rows} rowKey={(r) => r.cig} />;
}
