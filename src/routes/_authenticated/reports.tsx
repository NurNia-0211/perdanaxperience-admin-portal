import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const start = startOfMonth(new Date(year, month, 1));
  const end = endOfMonth(start);

  const { data, isFetching } = useQuery({
    queryKey: ["monthly-report", year, month],
    queryFn: async () => {
      const [fb, comp] = await Promise.all([
        supabase.from("feedback").select("id, rating, category, comment, created_at, buses(bus_number), passengers(full_name)")
          .gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
        supabase.from("complaints").select("id, status, feedback:feedback_id(created_at)"),
      ]);
      if (fb.error) throw fb.error;
      if (comp.error) throw comp.error;
      const monthComplaints = (comp.data ?? []).filter((c) => {
        const t = c.feedback?.created_at ? new Date(c.feedback.created_at).getTime() : 0;
        return t >= start.getTime() && t <= end.getTime();
      });
      return { feedback: fb.data ?? [], complaints: monthComplaints };
    },
  });

  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.feedback.length;
    const avg = total ? data.feedback.reduce((s, f) => s + f.rating, 0) / total : 0;
    const byCat = new Map<string, number>();
    data.feedback.forEach((f) => byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1));
    return {
      total, avg,
      categories: Array.from(byCat.entries()),
      resolved: data.complaints.filter((c) => c.status === "resolved").length,
      pending: data.complaints.filter((c) => c.status === "pending" || c.status === "in_progress").length,
      rejected: data.complaints.filter((c) => c.status === "rejected").length,
    };
  }, [data]);

  const period = `${MONTHS[month]} ${year}`;

  function exportCSV() {
    if (!data) return;
    const rows = [["Date","Passenger","Bus","Rating","Category","Comment"]];
    data.feedback.forEach((f) => {
      rows.push([
        format(new Date(f.created_at), "yyyy-MM-dd"),
        f.passengers?.full_name ?? "",
        f.buses?.bus_number ?? "",
        String(f.rating),
        f.category,
        (f.comment ?? "").replace(/\n/g, " "),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `feedback-${year}-${String(month + 1).padStart(2, "0")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    if (!data || !summary) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Monthly Feedback Report`, 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text(period, 14, 25);
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.text(`Total feedback: ${summary.total}`, 14, 38);
    doc.text(`Average rating: ${summary.avg.toFixed(2)} / 5`, 14, 45);
    doc.text(`Resolved complaints: ${summary.resolved}`, 14, 52);
    doc.text(`Pending complaints: ${summary.pending}`, 14, 59);
    doc.text(`Rejected complaints: ${summary.rejected}`, 14, 66);

    autoTable(doc, {
      startY: 74,
      head: [["Category", "Count"]],
      body: summary.categories.map(([c, n]) => [c, String(n)]),
      headStyles: { fillColor: [242, 169, 0] },
    });

    autoTable(doc, {
      head: [["Date", "Passenger", "Bus", "Rating", "Category"]],
      body: data.feedback.map((f) => [
        format(new Date(f.created_at), "MMM d"),
        f.passengers?.full_name ?? "—",
        f.buses?.bus_number ?? "—",
        String(f.rating),
        f.category,
      ]),
      headStyles: { fillColor: [242, 169, 0] },
      styles: { fontSize: 9 },
    });

    doc.save(`feedback-report-${year}-${String(month + 1).padStart(2, "0")}.pdf`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Monthly Feedback Reports</h2>
        <p className="text-sm text-muted-foreground">Generate and export reports for any month.</p>
      </div>

      <Card className="p-5 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs">Month</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={!data}><Download className="h-4 w-4 mr-2" />CSV</Button>
          <Button onClick={exportPDF} disabled={!data}><FileText className="h-4 w-4 mr-2" />PDF</Button>
        </div>
      </Card>

      {isFetching && <Card className="p-8 text-center text-muted-foreground">Loading report…</Card>}

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Mini label="Total feedback" value={summary.total} />
            <Mini label="Avg rating" value={summary.avg.toFixed(2)} suffix=" / 5" />
            <Mini label="Resolved" value={summary.resolved} tone="success" />
            <Mini label="Pending" value={summary.pending} tone="warning" />
            <Mini label="Rejected" value={summary.rejected} tone="destructive" />
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Breakdown by Category — {period}</h3>
            <div className="space-y-2">
              {summary.categories.length === 0 && <p className="text-sm text-muted-foreground">No feedback for this month.</p>}
              {summary.categories.map(([cat, n]) => {
                const pct = summary.total ? (n / summary.total) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{cat}</span>
                      <span className="text-muted-foreground">{n} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Mini({ label, value, suffix = "", tone = "primary" }: { label: string; value: string | number; suffix?: string; tone?: "primary" | "success" | "warning" | "destructive" }) {
  const c =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${c}`}>{value}<span className="text-sm text-muted-foreground">{suffix}</span></p>
    </Card>
  );
}
