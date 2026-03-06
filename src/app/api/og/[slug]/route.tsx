import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/db";

export const runtime = "edge";

const TEMPLATE_ICONS: Record<string, string> = {
  "flow-animator": "🔀",
  "code-walkthrough": "💻",
  "concept-builder": "🧠",
  "compare-contrast": "⚖️",
  "decision-tree": "🌳",
  "timeline": "📅",
  "component-explorer": "🏗️",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Fetch explainer data
  const { data: explainer } = await supabase
    .from("explainers")
    .select("title, summary, template")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  const title = explainer?.title || "Explainer";
  const summary = explainer?.summary || "Interactive explainer powered by AI";
  const templateIcon = TEMPLATE_ICONS[explainer?.template || ""] || "✦";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "system-ui, sans-serif",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Decorative gradient circles */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -50,
            left: -50,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)",
          }}
        />

        {/* Template icon */}
        <div
          style={{
            fontSize: 64,
            marginBottom: 24,
            display: "flex",
          }}
        >
          {templateIcon}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#f1f5f9",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: 900,
            display: "flex",
          }}
        >
          {title.length > 60 ? title.slice(0, 57) + "..." : title}
        </div>

        {/* Summary */}
        <div
          style={{
            fontSize: 24,
            color: "#94a3b8",
            textAlign: "center",
            marginTop: 16,
            maxWidth: 800,
            lineHeight: 1.4,
            display: "flex",
          }}
        >
          {summary.length > 120 ? summary.slice(0, 117) + "..." : summary}
        </div>

        {/* Branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 48,
            fontSize: 18,
            color: "#64748b",
          }}
        >
          <span style={{ display: "flex" }}>✦</span>
          <span style={{ display: "flex" }}>Made with Explainify</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
