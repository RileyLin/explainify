import { notFound } from "next/navigation";
import { supabase, getServiceClient } from "@/lib/db";
import { ExplainerDataSchema, type ExplainerData } from "@/lib/schemas/base";
import { ExplainerViewer } from "./viewer";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getExplainer(slug: string) {
  const { data, error } = await supabase
    .from("explainers")
    .select("*")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  if (error || !data) return null;
  return data;
}

async function incrementViews(slug: string) {
  try {
    const svc = getServiceClient();
    await svc.rpc("increment_views", { explainer_slug: slug });
  } catch {
    // Non-critical: don't fail the page if view count fails
    // We'll use a simpler approach below
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const explainer = await getExplainer(slug);
  if (!explainer) return { title: "Not Found" };

  return {
    title: `${explainer.title} — Explainify`,
    description: explainer.summary || "Interactive explainer powered by Explainify",
  };
}

export default async function ExplainerPage({ params }: PageProps) {
  const { slug } = await params;
  const explainer = await getExplainer(slug);

  if (!explainer) {
    notFound();
  }

  // Validate the data
  const parseResult = ExplainerDataSchema.safeParse(explainer.data);
  if (!parseResult.success) {
    notFound();
  }

  // Increment views (fire and forget via service role)
  try {
    const svc = getServiceClient();
    await svc
      .from("explainers")
      .update({ views: (explainer.views || 0) + 1 })
      .eq("slug", slug);
  } catch {
    // Non-critical
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <ExplainerViewer data={parseResult.data as ExplainerData} />

        {/* Footer */}
        <div className="mt-12 pb-8 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <span>✦</span>
            <span>Made with Explainify</span>
          </a>
        </div>
      </div>
    </div>
  );
}
