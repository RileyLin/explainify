import { notFound } from "next/navigation";
import { supabase, getServiceClient } from "@/lib/db";
import { ExplainerDataSchema, type ExplainerData } from "@/lib/schemas/base";
import { ExplainerClient } from "./explainer-client";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getExplainer(slug: string, userId?: string) {
  // Try public first
  const { data: publicData } = await supabase
    .from("explainers")
    .select("*")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  if (publicData) return { explainer: publicData, isDraft: false };

  // If not public, allow owner to view their own draft
  if (userId) {
    const svc = getServiceClient();
    const { data: draftData } = await svc
      .from("explainers")
      .select("*")
      .eq("slug", slug)
      .eq("user_id", userId)
      .single();

    if (draftData) return { explainer: draftData, isDraft: true };
  }

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getExplainer(slug);
  if (!result) return { title: "Not Found" };
  const { explainer } = result;

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
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: explainer.title }],
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
  const session = await auth();
  const result = await getExplainer(slug, session?.user?.id);

  if (!result) notFound();

  const { explainer, isDraft } = result;

  const parseResult = ExplainerDataSchema.safeParse(explainer.data);
  if (!parseResult.success) notFound();

  // Increment views for public explainers only
  if (!isDraft) {
    try {
      const svc = getServiceClient();
      await svc
        .from("explainers")
        .update({ views: (explainer.views || 0) + 1 })
        .eq("slug", slug);
    } catch {
      // Non-critical
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const pageUrl = `${appUrl}/e/${slug}`;

  return (
    <div className="min-h-screen bg-background">
      <ExplainerClient
        data={parseResult.data as ExplainerData}
        url={pageUrl}
        title={explainer.title}
        slug={slug}
        isDraft={isDraft}
      />
    </div>
  );
}
