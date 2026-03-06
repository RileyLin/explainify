import { notFound } from "next/navigation";
import { supabase, getServiceClient } from "@/lib/db";
import { ExplainerDataSchema, type ExplainerData } from "@/lib/schemas/base";
import { ExplainerViewer } from "./viewer";
import { ExplainerFooter } from "./footer";
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const explainer = await getExplainer(slug);
  if (!explainer) return { title: "Not Found" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const ogImageUrl = `${appUrl}/api/og/${slug}`;
  const pageUrl = `${appUrl}/e/${slug}`;

  return {
    title: `${explainer.title} — Explainify`,
    description: explainer.summary || "Interactive explainer powered by Explainify",
    openGraph: {
      title: explainer.title,
      description: explainer.summary || "Interactive explainer powered by Explainify",
      url: pageUrl,
      siteName: "Explainify",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: explainer.title,
        },
      ],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: explainer.title,
      description: explainer.summary || "Interactive explainer powered by Explainify",
      images: [ogImageUrl],
    },
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const pageUrl = `${appUrl}/e/${slug}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <ExplainerViewer data={parseResult.data as ExplainerData} />
        <ExplainerFooter
          url={pageUrl}
          title={explainer.title}
          slug={slug}
        />
      </div>
    </div>
  );
}
