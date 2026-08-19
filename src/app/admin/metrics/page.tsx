import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/**
 * Retention roadmap §0 — the measurement instrument every other item
 * on the roadmap gets judged against. Gated by a plain email allowlist
 * (ADMIN_EMAILS) rather than a role column — there's exactly one or
 * two people who need this, and a new table/RLS policy for that would
 * be more surface area than the problem needs right now.
 */
export default async function AdminMetricsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !allowlist.includes(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  const [{ data: cohorts, error: cohortsError }, { data: distribution, error: distError }] =
    await Promise.all([
      admin.rpc("admin_retention_cohorts"),
      admin.rpc("admin_streak_distribution"),
    ]);

  // Aggregate across all cohorts for one top-line number — per-cohort
  // rows below for the trend.
  const totals = (cohorts ?? []).reduce(
    (acc, c) => ({
      cohortSize: acc.cohortSize + c.cohort_size,
      d1: acc.d1 + c.d1_retained,
      d7: acc.d7 + c.d7_retained,
      d30: acc.d30 + c.d30_retained,
    }),
    { cohortSize: 0, d1: 0, d7: 0, d30: 0 },
  );

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Retention metrics</h1>
        <p className="text-xs text-muted">
          Signup-cohort retention and streak-length distribution — internal, not
          linked from anywhere in the app.
        </p>
      </div>

      {(cohortsError || distError) && (
        <Card>
          <CardContent className="text-sm text-danger">
            Couldn&apos;t load metrics: {cohortsError?.message ?? distError?.message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Overall (all cohorts)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold">{pct(totals.d1, totals.cohortSize)}</p>
            <p className="text-xs text-muted">D1</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{pct(totals.d7, totals.cohortSize)}</p>
            <p className="text-xs text-muted">D7</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{pct(totals.d30, totals.cohortSize)}</p>
            <p className="text-xs text-muted">D30</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Streak-length distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {(distribution ?? []).length === 0 && (
            <p className="text-sm text-muted">No streak data yet.</p>
          )}
          {(distribution ?? []).map((row) => (
            <div key={row.streak_bucket} className="flex items-center justify-between text-sm">
              <span className="text-muted">{row.streak_bucket} days</span>
              <span className="font-medium">{row.user_count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By signup cohort</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(cohorts ?? []).length === 0 && (
            <p className="text-sm text-muted">No cohorts yet.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="pb-1 pr-3">Signed up</th>
                  <th className="pb-1 pr-3">Size</th>
                  <th className="pb-1 pr-3">D1</th>
                  <th className="pb-1 pr-3">D7</th>
                  <th className="pb-1">D30</th>
                </tr>
              </thead>
              <tbody>
                {(cohorts ?? []).map((c) => (
                  <tr key={c.cohort_date} className="border-t border-border">
                    <td className="py-1 pr-3">{c.cohort_date}</td>
                    <td className="py-1 pr-3">{c.cohort_size}</td>
                    <td className="py-1 pr-3">{pct(c.d1_retained, c.cohort_size)}</td>
                    <td className="py-1 pr-3">{pct(c.d7_retained, c.cohort_size)}</td>
                    <td className="py-1">{pct(c.d30_retained, c.cohort_size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
