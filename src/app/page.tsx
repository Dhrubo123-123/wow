import Link from "next/link";
import { Button, Badge } from "@/components/ui";
import { Logo } from "@/components/branding/Logo";

const SITE_URL = "https://emberss.shop";

// schema.org structured data — this is what lets Google show a rich
// result (app card, ratings slot, etc.) instead of a plain blue link,
// and is exactly what answer engines (ChatGPT/Perplexity/Google AI
// Overviews) parse to answer "what is EMBER" accurately instead of
// guessing from prose alone. No aggregateRating/review fields — those
// must reflect real user reviews, never fabricated for SEO.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "EMBER",
  alternateName: "EMBER — AI-Powered Real-Life RPG",
  url: SITE_URL,
  description:
    "EMBER turns your real-life goals into AI-generated quests. Submit evidence, get evaluated by an AI Game Master, earn XP, level up, and unlock skills.",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Any (Progressive Web App)",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  browserRequirements: "Requires a modern web browser",
  softwareVersion: "1.0",
};

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col justify-between p-6">
      <script
        type="application/ld+json"
        // Static, hand-authored JSON — no user input reaches this.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
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
        <Link href="/onboarding" className="block">
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
