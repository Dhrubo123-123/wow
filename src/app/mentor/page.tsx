import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MentorChat } from "@/components/mentor/MentorChat";

export default async function MentorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: history } = await supabase
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(50);

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border p-4">
        <h1 className="text-lg font-semibold">AI Mentor</h1>
        <p className="text-xs text-muted">
          Ask what to do today, why you&apos;re stuck, or how close you are to
          your goal.
        </p>
      </div>
      <MentorChat initialMessages={history ?? []} />
    </div>
  );
}
