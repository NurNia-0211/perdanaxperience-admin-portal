import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, subDays, eachWeekOfInterval } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/analytics")({
  loader: ({ context }) => context.queryClient.ensureQueryData(analyticsQuery),
  component: AnalyticsPage,
});

const analyticsQuery = queryOptions({
  queryKey: ["analytics"],
  queryFn: async () => {
    const [fb, comp] = await Promise.all([
      supabase.from("feedback").select("id, rating, category, created_at, buses(bus_number, route_name)"),
      supabase.from("complaints").select("id, status, updated_at, created_at"),
    ]);
    if (fb.error) throw fb.error;
    if (comp.error) throw comp.error;
    return { feedback: fb.data ?? [], complaints: comp.data ?? [] };
  },
});

const PIE_COLORS = ["var(--color-chart-1)","var(--color-chart-2)","var(--color-chart-3)","var(--color-chart-4)","var(--color-chart-5)","var(--color-primary)","var(--color-muted-foreground)"];

function AnalyticsPage() {
  const { data } = useSuspenseQuery(analyticsQuery);
  const [from, setFrom] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime() + 86_400_000;

  const feedback = data.feedback.filter((f) => {
    const t = new Date(f.created_at).getTime();
    return t >= fromTs && t < toTs;
  });

  const avgByBus = useMemo(() => {
    const map = new Map<string, { sum: number; n: number; route: string }>();
    feedback.forEach((f) => {
      if (!f.buses) return;
      const k = f.buses.bus_number;
      const cur = map.get(k) ?? { sum: 0, n: 0, route: f.buses.route_name };
      cur.sum += f.rating; cur.n += 1;
      map.set(k, cur);
    });
    return Array.from(map.entries()).map(([bus, v]) => ({ bus, avg: +(v.sum / v.n).toFixed(2), route: v.route })).sort((a, b) => b.avg - a.avg);
  }, [feedback]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    feedback.forEach((f) => map.set(f.category, (map.get(f.category) ?? 0) + 1));
    return Array.from(map.entries()).map(([category, count]) => ({ category, count }));
  }, [feedback]);

  const resolutionTrend = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: new Date(from), end: new Date(to) });
    return weeks.map((w) => {
      const start = w.getTime();
      const end = start + 7 * 86_400_000;
      const inWeek = data.complaints.filter((c) => {
        const t = new Date(c.updated_at).getTime();
        return t >= start && t < end;
      });
      const total = inWeek.length || 1;
      const resolved = inWeek.filter((c) => c.status === "resolved").length;
      return { week: format(w, "MMM d"), rate: Math.round((resolved / total) * 100) };
    });
  }, [data.complaints, from, to]);

  const topComplaintBuses = useMemo(() => {
    const lows = feedback.filter((f) => f.rating <= 2 && f.buses);
    const map = new Map<string, number>();
    lows.forEach((f) => map.set(f.buses!.bus_number, (map.get(f.buses!.bus_number) ?? 0) + 1));
    return Array.from(map.entries()).map(([bus, count]) => ({ bus, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [feedback]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Reports & Analytics</h2>
          <p className="text-sm text-muted-foreground">{feedback.length} feedback entries in selected range</p>
        </div>
        <Card className="p-3 flex items-end gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Average Rating per Bus</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={avgByBus} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" domain={[0, 5]} stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis type="category" dataKey="bus" stroke="var(--color-muted-foreground)" fontSize={12} width={60} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="avg" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Feedback by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={byCategory} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={100} label>
                {byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Complaint Resolution Rate (weekly %)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={resolutionTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="week" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="rate" stroke="var(--color-primary)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Top 5 Buses with Most Complaints</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topComplaintBuses}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="bus" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="count" fill="var(--color-destructive)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
