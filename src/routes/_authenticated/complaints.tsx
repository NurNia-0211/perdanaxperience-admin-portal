import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RatingStars } from "./dashboard";

export const Route = createFileRoute("/_authenticated/complaints")({
  loader: ({ context }) => context.queryClient.ensureQueryData(complaintsQuery),
  component: ComplaintsPage,
});

async function fetchComplaints() {
  const { data, error } = await supabase
    .from("complaints")
    .select("id, status, remarks, updated_at, created_at, feedback:feedback_id(id, rating, category, comment, created_at, buses(bus_number, route_name), passengers(full_name))")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
const complaintsQuery = queryOptions({ queryKey: ["complaints"], queryFn: fetchComplaints });
type Row = Awaited<ReturnType<typeof fetchComplaints>>[number];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", in_progress: "In Progress", resolved: "Resolved", rejected: "Rejected",
};

function statusBadge(status: string) {
  const cls =
    status === "resolved" ? "bg-success/15 text-success border-success/30" :
    status === "rejected" ? "bg-destructive/15 text-destructive border-destructive/30" :
    status === "in_progress" ? "bg-primary/15 text-primary border-primary/30" :
    "bg-warning/15 text-warning border-warning/30";
  return <Badge variant="outline" className={cls}>{STATUS_LABEL[status]}</Badge>;
}

function ComplaintsPage() {
  const { data } = useSuspenseQuery(complaintsQuery);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const [remarks, setRemarks] = useState("");
  const [newStatus, setNewStatus] = useState("pending");
  const [saving, setSaving] = useState(false);

  async function updateStatusInline(id: string, status: string) {
    const { error } = await supabase.from("complaints").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["complaints"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  }

  async function saveRemarks() {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from("complaints").update({ status: newStatus, remarks }).eq("id", editing.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["complaints"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Complaint Status</h2>
        <p className="text-sm text-muted-foreground">Low-rating feedback automatically flagged as complaints ({data.length} total).</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Date</th>
                <th className="text-left py-3 px-4 font-medium">Passenger</th>
                <th className="text-left py-3 px-4 font-medium">Bus</th>
                <th className="text-left py-3 px-4 font-medium">Rating</th>
                <th className="text-left py-3 px-4 font-medium">Comment</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Update</th>
                <th className="text-left py-3 px-4 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{format(new Date(c.feedback?.created_at ?? c.created_at), "MMM d, yyyy")}</td>
                  <td className="py-3 px-4">{c.feedback?.passengers?.full_name ?? "—"}</td>
                  <td className="py-3 px-4">{c.feedback?.buses?.bus_number ?? "—"}</td>
                  <td className="py-3 px-4"><RatingStars value={c.feedback?.rating ?? 0} /></td>
                  <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">{c.feedback?.comment ?? "—"}</td>
                  <td className="py-3 px-4">{statusBadge(c.status)}</td>
                  <td className="py-3 px-4">
                    <Select value={c.status} onValueChange={(v) => updateStatusInline(c.id, v)}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-3 px-4">
                    <Button size="sm" variant="ghost" className="text-primary" onClick={() => { setEditing(c); setRemarks(c.remarks ?? ""); setNewStatus(c.status); }}>
                      {c.remarks ? "View" : "Add"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Internal remarks</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p><span className="text-foreground">{editing.feedback?.passengers?.full_name}</span> · Bus {editing.feedback?.buses?.bus_number}</p>
                <p className="mt-1 italic">"{editing.feedback?.comment}"</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Remarks</label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} placeholder="Internal notes about the resolution…" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveRemarks} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
