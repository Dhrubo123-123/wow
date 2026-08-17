import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Avatar } from "@/components/ui";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this route, but Server Components should
  // never assume — redirect defensively if the session is somehow gone.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const displayName = profile?.name || user.email || "Adventurer";

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar name={displayName} src={profile?.avatar_url} levelBadge={profile?.level ?? 1} />
            <div>
              <CardTitle>{displayName}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted">
            Full profile editing, skills, achievements, and streak lands in
            Phase 3.
          </p>
        </CardContent>
      </Card>

      <LogoutButton fullWidth />
    </div>
  );
}
