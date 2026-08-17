import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Temporary route content shown for screens whose real data/logic lands
 * in a later phase (Supabase auth, XP engine, AI provider, etc.). Exists
 * so Phase 1 can demonstrate routing + the mobile shell end-to-end.
 */
export function PhasePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>{description}</CardDescription>
          <p className="mt-3 text-xs text-muted">Implemented in {phase}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
