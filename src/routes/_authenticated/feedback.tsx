import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RatingStars } from "./dashboard";

export const Route = createFileRoute("/_authenticated/feedback")({
  loader: ({ context }) => context.queryClient.ensureQueryData(feedbackQuery),
  component: FeedbackPage,
});

const CATEGORIES = ["Driver Behaviour","Cleanliness","Punctuality","Comfort","Safety","Fare/Ticketing","Other"];
const STATUSES = ["new","reviewed","archived"];

async function fetchFeedback() {
  const { data, error } = await supabase
    .from("feedback")
    .select("id, rating, category, comment, status, created_at, buses(bus_number, route_name), passengers(full_name, email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
const feedbackQuery = queryOptions({ queryKey: ["feedback-all"], queryFn: fetchFeedback });
type Row = Awaited<ReturnType<typeof fetchFeedback>>[number];

function FeedbackPage() {
  const { data } = useSuspenseQuery(feedbackQuery);
  const [search, setSearch] = useState("");
  const [bus, setBus] = useState("all");
  const [rating, setRating] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Row | null>(null);

  const buses = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((f) => { if (f.buses) m.set(f.buses.bus_number, `${f.buses.bus_number} — ${f.buses.route_name}`); });
    return Array.from(m.entries());
  }, [data]);

  const filtered = data.filter((f) => {
    if (bus !== "all" && f.buses?.bus_number !== bus) return false;
    if (rating !== "all" && f.rating !== Number(rating)) return false;
    if (category !== "all" && f.category !== category) return false;
    if (status !== "all" && f.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(f.passengers?.full_name?.toLowerCase().includes(q) || f.comment?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Manage Customer Feedback</h2>
        <p className="text-sm text-muted-foreground">{filtered.length} of {data.length} entries</p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or comment…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={bus} onValueChange={setBus}>
            <SelectTrigger><SelectValue placeholder="Bus/Route" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buses</SelectItem>
              {buses.map(([n, label]) => <SelectItem key={n} value={n}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger><SelectValue placeholder="Rating" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              {[5,4,3,2,1].map((r) => <SelectItem key={r} value={String(r)}>{r} stars</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Date</th>
                <th className="text-left py-3 px-4 font-medium">Passenger</th>
                <th className="text-left py-3 px-4 font-medium">Bus / Route</th>
                <th className="text-left py-3 px-4 font-medium">Rating</th>
                <th className="text-left py-3 px-4 font-medium">Category</th>
                <th className="text-left py-3 px-4 font-medium">Comment</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(f)}>
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{format(new Date(f.created_at), "MMM d, yyyy")}</td>
                  <td className="py-3 px-4">{f.passengers?.full_name ?? "—"}</td>
                  <td className="py-3 px-4">{f.buses?.bus_number ?? "—"}</td>
                  <td className="py-3 px-4"><RatingStars value={f.rating} /></td>
                  <td className="py-3 px-4 text-muted-foreground">{f.category}</td>
                  <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">{f.comment}</td>
                  <td className="py-3 px-4"><Badge variant="outline" className="capitalize">{f.status}</Badge></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No feedback matches filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Feedback details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <Detail label="Date" value={format(new Date(selected.created_at), "PPpp")} />
              <Detail label="Passenger" value={`${selected.passengers?.full_name ?? "—"} (${selected.passengers?.email ?? "—"})`} />
              <Detail label="Bus / Route" value={`${selected.buses?.bus_number ?? "—"} — ${selected.buses?.route_name ?? ""}`} />
              <Detail label="Category" value={selected.category} />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Rating</p>
                <RatingStars value={selected.rating} />
              </div>
              <Detail label="Status" value={selected.status} />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Comment</p>
                <p className="rounded-md bg-muted/40 p-3 text-foreground">{selected.comment ?? "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}
