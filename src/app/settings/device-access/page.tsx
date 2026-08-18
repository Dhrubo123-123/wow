import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DevicePermissionsPanel } from "@/components/settings/DevicePermissionsPanel";

export default async function DeviceAccessSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: permissions } = await supabase
    .from("device_permissions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Device Access</h1>
      <p className="text-sm text-muted">
        ASCEND never bypasses your browser&apos;s own permission prompts —
        this page only reflects and lets you (re)check the current state.
      </p>
      <DevicePermissionsPanel
        userId={user.id}
        initial={{
          camera: permissions?.camera ?? "unknown",
          microphone: permissions?.microphone ?? "unknown",
          motion: permissions?.motion ?? "unknown",
          location: permissions?.location ?? "unknown",
          notifications: permissions?.notifications ?? "unknown",
        }}
      />
    </div>
  );
}
