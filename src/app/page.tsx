import Link from "next/link";
import { Button, Badge } from "@/components/ui";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col justify-between p-6">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <Badge variant="accent">AI-Powered Real-Life RPG</Badge>
        <div className="space-y-2">
          <h1 className="text-gradient-primary text-5xl font-extrabold tracking-tight">
            ASCEND
          </h1>
          <p className="text-muted">Turn Your Real Life Into Quests.</p>
        </div>
        <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
          {["Goal", "AI Quest", "Action", "Evidence", "XP", "Level Up"].map(
            (step, i, arr) => (
              <li key={step} className="flex items-center gap-2">
                <span>{step}</span>
                {i < arr.length - 1 && <span aria-hidden="true">→</span>}
              </li>
            ),
          )}
        </ol>
      </div>
      <div className="space-y-3 pb-safe">
        <Link href="/signup" className="block">
          <Button fullWidth size="lg">
            Start Your Ascent
          </Button>
        </Link>
        <Link href="/login" className="block">
          <Button fullWidth size="lg" variant="secondary">
            Log In
          </Button>
        </Link>
      </div>
    </div>
  );
}
