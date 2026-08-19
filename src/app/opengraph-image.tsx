import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dynamically generated at request time (and cached by Vercel's edge
// network) — this is what shows up when the link is shared on
// Twitter/X, LinkedIn, WhatsApp, Slack, Discord, etc. A missing or
// generic OG image is a real, common reason a link looks untrustworthy
// or gets no clicks when shared; this is the fix for that, not just a
// meta-tag checkbox.
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #2a1806 0%, #05061a 60%, #05061a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 160,
            height: 160,
            borderRadius: "50%",
            border: "4px solid #ffc531",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 88,
            marginBottom: 28,
            boxShadow: "0 0 60px 10px rgba(255,197,49,0.35)",
          }}
        >
          🔥
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 108,
            fontWeight: 900,
            letterSpacing: 12,
            color: "#ffc531",
            textShadow: "0 4px 24px rgba(255,197,49,0.4)",
          }}
        >
          EMBER
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 34,
            color: "#c9cdf0",
          }}
        >
          Turn Your Real Life Into Quests
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            padding: "10px 28px",
            borderRadius: 999,
            border: "1px solid #4b3a1a",
            background: "rgba(255,197,49,0.08)",
            fontSize: 24,
            color: "#ffc531",
          }}
        >
          AI-Powered Real-Life RPG
        </div>
      </div>
    ),
    { ...size },
  );
}
