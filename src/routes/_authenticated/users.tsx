import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Search, Trash2, UserCheck, UserX, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(passengersQuery);
    context.queryClient.ensureQueryData(adminsQuery);
  },
  component: UsersPage,
});

const passengersQuery = queryOptions({
  queryKey: ["passengers"],
  queryFn: async () => {
    const { data, error } = await supabase.from("passengers").select("*").order("registered_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

const adminsQuery = queryOptions({
  queryKey: ["admins"],
  queryFn: async () => {
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("id, role, user_id, created_at");
    if (error) throw error;
    const ids = (roles ?? []).map((r) => r.user_id);
    let profiles: Array<{ id: string; full_name: string | null; phone: string | null }> = [];
    if (ids.length) {
      const { data: profData } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
      profiles = profData ?? [];
    }
    return (roles ?? []).map((r) => ({
      ...r,
      profile: profiles.find((p) => p.id === r.user_id) ?? null,
    }));
  },
});

function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">User Account Management</h2>
        <p className="text-sm text-muted-foreground">Manage passenger records and admin/staff accounts.</p>
      </div>
      <Tabs defaultValue="passengers">
        <TabsList>
          <TabsTrigger value="passengers">Passengers</TabsTrigger>
          <TabsTrigger value="admins">Admins & Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="passengers" className="mt-4"><PassengerTable /></TabsContent>
        <TabsContent value="admins" className="mt-4"><AdminTable /></TabsContent>
      </Tabs>
    </div>
  );
}

function PassengerTable() {
  const { data } = useSuspenseQuery(passengersQuery);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });

  const filtered = data.filter((p) =>
    !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase())
  );

  async function toggle(id: string, status: string) {
    const next = status === "active" ? "suspended" : "active";
    const { error } = await supabase.from("passengers").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Account ${next}`);
    qc.invalidateQueries({ queryKey: ["passengers"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this passenger? This cannot be undone.")) return;
    const { error } = await supabase.from("passengers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["passengers"] });
  }
  async function addPassenger() {
    if (!form.full_name) return toast.error("Name required");
    const { error } = await supabase.from("passengers").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Passenger added");
    setAdding(false); setForm({ full_name: "", email: "", phone: "" });
    qc.invalidateQueries({ queryKey: ["passengers"] });
  }

  return (
    <>
      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogTrigger asChild><Button>Add passenger</Button></DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>Add passenger</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <Button onClick={addPassenger} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="p-0 mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Name</th>
                <th className="text-left py-3 px-4 font-medium">Email</th>
                <th className="text-left py-3 px-4 font-medium">Phone</th>
                <th className="text-left py-3 px-4 font-medium">Registered</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/50 last:border-0">
                  <td className="py-3 px-4">{p.full_name}</td>
                  <td className="py-3 px-4 text-muted-foreground">{p.email ?? "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{p.phone ?? "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{format(new Date(p.registered_at), "MMM d, yyyy")}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={p.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-destructive/15 text-destructive border-destructive/30"}>{p.status}</Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button size="sm" variant="ghost" onClick={() => toggle(p.id, p.status)}>
                      {p.status === "active" ? <><UserX className="h-4 w-4 mr-1" />Suspend</> : <><UserCheck className="h-4 w-4 mr-1" />Activate</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function AdminTable() {
  const { data } = useSuspenseQuery(adminsQuery);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <p className="text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 inline mr-1 text-primary" />New admin/staff accounts are created via the sign-up page. The first account becomes the primary admin.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground bg-muted/30 border-b border-border">
            <tr>
              <th className="text-left py-3 px-4 font-medium">Name</th>
              <th className="text-left py-3 px-4 font-medium">Phone</th>
              <th className="text-left py-3 px-4 font-medium">Role</th>
              <th className="text-left py-3 px-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-b border-border/50 last:border-0">
                <td className="py-3 px-4">{r.profile?.full_name ?? r.user_id.slice(0, 8)}</td>
                <td className="py-3 px-4 text-muted-foreground">{r.profile?.phone ?? "—"}</td>
                <td className="py-3 px-4">
                  <Badge variant="outline" className={r.role === "admin" ? "bg-primary/15 text-primary border-primary/30" : ""}>{r.role}</Badge>
                </td>
                <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "MMM d, yyyy")}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No staff records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
