import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import type { Tables } from "@/integrations/supabase/types";

type DriverProfile = Tables<"driver_profiles">;
type UserRole = Tables<"user_roles">;

const RACING_CATEGORIES = [
  "karting", "single_seater", "gt", "touring_car", "sports_car",
  "rally", "endurance", "formula", "stock_car", "other",
] as const;

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create driver form
  const [driverFirst, setDriverFirst] = useState("");
  const [driverLast, setDriverLast] = useState("");
  const [driverNationality, setDriverNationality] = useState("");
  const [driverCategory, setDriverCategory] = useState<string>("other");
  const [driverBio, setDriverBio] = useState("");
  const [creatingDriver, setCreatingDriver] = useState(false);

  // Role management
  const [roleEmail, setRoleEmail] = useState("");
  const [roleToGrant, setRoleToGrant] = useState<string>("driver");
  const [grantingRole, setGrantingRole] = useState(false);

  // Existing drivers list
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin");

    if (!data || data.length === 0) {
      navigate("/");
      return;
    }
    setIsAdmin(true);
    setLoading(false);
    fetchDrivers();
    fetchRoles();
  };

  const fetchDrivers = async () => {
    const { data } = await supabase
      .from("driver_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDrivers(data);
  };

  const fetchRoles = async () => {
    const { data } = await supabase.from("user_roles").select("*");
    if (data) setRoles(data);
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingDriver(true);
    const { error } = await supabase.from("driver_profiles").insert({
      first_name: driverFirst,
      last_name: driverLast,
      nationality: driverNationality || null,
      primary_category: driverCategory as any,
      bio: driverBio || null,
    });
    setCreatingDriver(false);
    if (error) {
      toast({ title: "Error creating profile", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver profile created" });
      setDriverFirst("");
      setDriverLast("");
      setDriverNationality("");
      setDriverCategory("other");
      setDriverBio("");
      fetchDrivers();
    }
  };

  const handleGrantRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantingRole(true);

    // Look up user by email via a simple edge approach — we need to find the user_id
    // Since we can't query auth.users directly, we'll use a workaround:
    // Admin can enter the user_id directly or we search user_roles
    // For now, let's accept user_id input
    const { error } = await supabase.from("user_roles").insert({
      user_id: roleEmail, // treating this as user_id
      role: roleToGrant as any,
    });
    setGrantingRole(false);
    if (error) {
      toast({ title: "Error granting role", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role granted successfully" });
      setRoleEmail("");
      fetchRoles();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex min-h-screen items-center justify-center pt-16">
          <p className="text-muted-foreground">Checking permissions…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container pt-24 pb-16">
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground mb-8">Manage drivers, roles, and platform data.</p>

        <Tabs defaultValue="create-driver" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="create-driver">Create Driver</TabsTrigger>
            <TabsTrigger value="drivers">All Drivers ({drivers.length})</TabsTrigger>
            <TabsTrigger value="roles">Manage Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="create-driver">
            <div className="max-w-lg rounded-xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold text-card-foreground mb-4">New Driver Profile</h2>
              <form onSubmit={handleCreateDriver} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="dFirst" className="text-card-foreground">First Name</Label>
                    <Input id="dFirst" value={driverFirst} onChange={(e) => setDriverFirst(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="dLast" className="text-card-foreground">Last Name</Label>
                    <Input id="dLast" value={driverLast} onChange={(e) => setDriverLast(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="dNat" className="text-card-foreground">Nationality</Label>
                  <Input id="dNat" value={driverNationality} onChange={(e) => setDriverNationality(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label className="text-card-foreground">Primary Category</Label>
                  <Select value={driverCategory} onValueChange={setDriverCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RACING_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dBio" className="text-card-foreground">Bio</Label>
                  <Input id="dBio" value={driverBio} onChange={(e) => setDriverBio(e.target.value)} placeholder="Optional" />
                </div>
                <Button type="submit" disabled={creatingDriver} className="w-full">
                  {creatingDriver ? "Creating…" : "Create Driver Profile"}
                </Button>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="drivers">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Nationality</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Claimed</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3 text-card-foreground">{d.first_name} {d.last_name}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{d.primary_category?.replace(/_/g, " ") ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{d.nationality ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${d.is_claimed ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {d.is_claimed ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/driver/${d.id}`)}>View</Button>
                      </td>
                    </tr>
                  ))}
                  {drivers.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No drivers yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="roles">
            <div className="max-w-lg rounded-xl border border-border bg-card p-6 mb-6">
              <h2 className="font-display text-xl font-bold text-card-foreground mb-4">Grant Role</h2>
              <form onSubmit={handleGrantRole} className="space-y-4">
                <div>
                  <Label htmlFor="rUserId" className="text-card-foreground">User ID</Label>
                  <Input id="rUserId" value={roleEmail} onChange={(e) => setRoleEmail(e.target.value)} placeholder="Paste user UUID" required />
                </div>
                <div>
                  <Label className="text-card-foreground">Role</Label>
                  <Select value={roleToGrant} onValueChange={setRoleToGrant}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="team_sponsor">Team / Sponsor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={grantingRole} className="w-full">
                  {grantingRole ? "Granting…" : "Grant Role"}
                </Button>
              </form>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">User ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-card-foreground">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="px-4 py-3 text-card-foreground font-mono text-xs">{r.user_id}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{r.role.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
