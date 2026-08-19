import Link from "next/link";
import { Button, Badge } from "@/components/ui";
import { Logo } from "@/components/branding/Logo";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col justify-between p-6">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <Badge variant="accent">AI-Powered Real-Life RPG</Badge>
        <div className="space-y-2">
          <Logo size={104} />
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
            Light Your Ember
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
