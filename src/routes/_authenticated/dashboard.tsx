import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  MessageSquare, AlertTriangle, CheckCircle2, Star,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { format, subDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  component: DashboardPage,
});

const overviewQuery = queryOptions({
  queryKey: ["overview"],
  queryFn: async () => {
    const [fb, complaints, complaintsResolved] = await Promise.all([
      supabase.from("feedback").select("id, rating, created_at, category, comment, status, buses(bus_number, route_name), passengers(full_name)").order("created_at", { ascending: false }),
      supabase.from("complaints").select("id, status"),
      supabase.from("complaints").select("id").eq("status", "resolved"),
    ]);
    if (fb.error) throw fb.error;
    if (complaints.error) throw complaints.error;
    const feedback = fb.data ?? [];
    const total = feedback.length;
    const avg = total ? feedback.reduce((s, f) => s + f.rating, 0) / total : 0;
    const ratingDist = [1, 2, 3, 4, 5].map((r) => ({
      rating: `${r}★`,
      count: feedback.filter((f) => f.rating === r).length,
    }));
    const trend = Array.from({ length: 30 }).map((_, i) => {
      const d = subDays(new Date(), 29 - i);
      const key = format(d, "MMM dd");
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const count = feedback.filter((f) => {
        const ts = new Date(f.created_at).getTime();
        return ts >= dayStart.getTime() && ts <= dayEnd.getTime();
      }).length;
      return { day: key, count };
    });
    return {
      total,
      avg,
      pending: (complaints.data ?? []).filter((c) => c.status === "pending" || c.status === "in_progress").length,
      resolved: (complaintsResolved.data ?? []).length,
      ratingDist,
      trend,
      recent: feedback.slice(0, 5),
    };
  },
});

function DashboardPage() {
  const { data } = useSuspenseQuery(overviewQuery);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Overview</h2>
        <p className="text-sm text-muted-foreground">Real-time snapshot of customer feedback and complaints.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Feedback" value={data.total} icon={MessageSquare} />
        <StatCard label="Pending Complaints" value={data.pending} icon={AlertTriangle} tone="warning" />
        <StatCard label="Resolved Complaints" value={data.resolved} icon={CheckCircle2} tone="success" />
        <StatCard label="Average Rating" value={data.avg.toFixed(2)} icon={Star} suffix=" / 5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Rating Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.ratingDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="rating" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Feedback — Last 30 Days</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} interval={4} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Recent Feedback</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 pr-4 font-medium">Date</th>
                <th className="text-left py-2 pr-4 font-medium">Passenger</th>
                <th className="text-left py-2 pr-4 font-medium">Bus / Route</th>
                <th className="text-left py-2 pr-4 font-medium">Rating</th>
                <th className="text-left py-2 pr-4 font-medium">Category</th>
                <th className="text-left py-2 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((f) => (
                <tr key={f.id} className="border-b border-border/50 last:border-0">
                  <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{format(new Date(f.created_at), "MMM d, yyyy")}</td>
                  <td className="py-3 pr-4 text-foreground">{f.passengers?.full_name ?? "—"}</td>
                  <td className="py-3 pr-4 text-foreground">{f.buses?.bus_number ?? "—"} <span className="text-muted-foreground">· {f.buses?.route_name ?? ""}</span></td>
                  <td className="py-3 pr-4"><RatingStars value={f.rating} /></td>
                  <td className="py-3 pr-4 text-muted-foreground">{f.category}</td>
                  <td className="py-3 text-muted-foreground max-w-md truncate">{f.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "primary", suffix = "" }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; tone?: "primary" | "warning" | "success"; suffix?: string }) {
  const toneClass =
    tone === "success" ? "text-success bg-success/10 ring-success/20" :
    tone === "warning" ? "text-destructive bg-destructive/10 ring-destructive/20" :
    "text-primary bg-primary/10 ring-primary/20";
  return (
    <Card className="p-5 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}<span className="text-base text-muted-foreground">{suffix}</span></p>
        </div>
        <div className={`h-10 w-10 rounded-lg ring-1 flex items-center justify-center ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function RatingStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= value ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}
