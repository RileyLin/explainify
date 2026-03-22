import { notFound } from "next/navigation";
import { supabase, getServiceClient } from "@/lib/db";
import { ExplainerDataSchema, type ExplainerData } from "@/lib/schemas/base";
import { ExplainerClient } from "./explainer-client";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import type { BreadcrumbSegment } from "@/components/viewer/breadcrumb";
import type { ChildrenMap } from "@/components/viewer/explore-context";

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

/**
 * Fetch parent chain for breadcrumb navigation.
 * Walks up the parent_slug chain until there's no more parent.
 * Returns segments in root-first order: [root, ..., current]
 * Cap at 5 levels to prevent infinite loops / performance issues.
 */
async function fetchBreadcrumbChain(
  currentSlug: string,
  currentTitle: string,
  parentSlug: string | null | undefined,
): Promise<BreadcrumbSegment[]> {
  if (!parentSlug) {
    return [{ label: currentTitle, slug: currentSlug }];
  }

  const svc = getServiceClient();
  const segments: BreadcrumbSegment[] = [{ label: currentTitle, slug: currentSlug }];
  let nextSlug: string | null = parentSlug;
  const visited = new Set<string>([currentSlug]);

  // Walk up the chain (cap at 5 levels to avoid runaway queries)
  for (let i = 0; i < 5 && nextSlug; i++) {
    if (visited.has(nextSlug)) break; // cycle guard
    visited.add(nextSlug);

    const { data: parentRow } = await svc
      .from("explainers")
      .select("slug, title, parent_slug")
      .eq("slug", nextSlug)
      .single() as { data: { slug: string; title: string; parent_slug: string | null } | null };

    if (!parentRow) break;

    segments.push({ label: parentRow.title, slug: parentRow.slug });
    nextSlug = parentRow.parent_slug ?? null;
  }

  // Reverse so root comes first
  return segments.reverse();
}

/**
 * Fetch all child explainers for a given parent slug.
 * Returns a map of source_node_id → { slug, title } for quick lookup.
 */
async function fetchChildrenMap(parentSlug: string): Promise<ChildrenMap> {
  try {
    const svc = getServiceClient();
    const { data: children } = await svc
      .from("explainers")
      .select("source_node_id, slug, title")
      .eq("parent_slug", parentSlug)
      .not("source_node_id", "is", null)
      .limit(50) as { data: { source_node_id: string; slug: string; title: string }[] | null };

    if (!children) return {};

    const map: ChildrenMap = {};
    for (const child of children) {
      // If multiple deep dives exist for same node, use the latest (last in array)
      map[child.source_node_id] = { slug: child.slug, title: child.title };
    }
    return map;
  } catch {
    return {};
  }
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
    title: `${explainer.title} — VizBrief`,
    description: explainer.summary || "Interactive explainer powered by VizBrief",
    openGraph: {
      title: explainer.title,
      description: explainer.summary || "Interactive explainer powered by VizBrief",
      url: pageUrl,
      siteName: "VizBrief",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: explainer.title }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: explainer.title,
      description: explainer.summary || "Interactive explainer powered by VizBrief",
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

  // Build breadcrumb chain if this is a deep dive
  const breadcrumbs = await fetchBreadcrumbChain(
    slug,
    explainer.title,
    explainer.parent_slug ?? null,
  );

  // Fetch existing children (for explored-node indicators)
  const childrenMap = await fetchChildrenMap(slug);

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
        breadcrumbs={breadcrumbs}
        childrenMap={childrenMap}
        chapterImageUrl={explainer.chapter_image_url ?? null}
      />
    </div>
  );
}
