import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db";
import { ExplainerDataSchema } from "@/lib/schemas/base";
import { auth } from "@/lib/auth";

/**
 * Generate a short random slug (8 chars, alphanumeric).
 */
function generateSlug(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, sourceContent } = body as {
      data?: unknown;
      sourceContent?: string;
    };

    if (!data) {
      return NextResponse.json(
        { error: "Explainer data is required" },
        { status: 400 },
      );
    }

    // Validate the explainer data
    const parseResult = ExplainerDataSchema.safeParse(data);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid explainer data",
          details: parseResult.error.message,
        },
        { status: 400 },
      );
    }

    // Get authenticated user (optional — anonymous publishing allowed)
    const session = await auth();
    const userId = session?.user?.id || null;

    const validData = parseResult.data;
    const slug = generateSlug();
    const supabase = getServiceClient();

    const insertData: Record<string, unknown> = {
      slug,
      title: validData.meta.title,
      summary: validData.meta.summary,
      template: validData.template,
      data: validData as unknown as Record<string, unknown>,
      source_content: sourceContent || null,
      is_public: true,
      user_id: userId,
    };

    const { error: insertError } = await supabase.from("explainers").insert(insertData);

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      // If slug collision, retry once
      if (insertError.code === "23505") {
        const retrySlug = generateSlug(10);
        const { error: retryError } = await supabase
          .from("explainers")
          .insert({ ...insertData, slug: retrySlug });

        if (retryError) {
          return NextResponse.json(
            { error: "Failed to publish explainer" },
            { status: 500 },
          );
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        return NextResponse.json({
          slug: retrySlug,
          url: `${appUrl}/e/${retrySlug}`,
        });
      }

      return NextResponse.json(
        { error: "Failed to publish explainer" },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.json({
      slug,
      url: `${appUrl}/e/${slug}`,
    });
  } catch (error) {
    console.error("Unexpected error in /api/publish:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
