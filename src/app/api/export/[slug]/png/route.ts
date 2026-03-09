import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const frame = request.nextUrl.searchParams.get("frame") === "true";

  // Verify the explainer exists and is public
  const supabase = getServiceClient();
  const { data: explainer } = await supabase
    .from("explainers")
    .select("slug, title")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  if (!explainer) {
    return NextResponse.json({ error: "Explainer not found" }, { status: 404 });
  }

  try {
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({
      executablePath: "/home/node/.cache/ms-playwright/chromium-1208/chrome-linux/chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();

    // Set viewport to OG image dimensions
    await page.setViewportSize({ width: 1200, height: 630 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://explainify.driftworks.dev";
    await page.goto(`${appUrl}/e/${slug}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for the viewer to render
    await page.waitForTimeout(2000);

    let screenshotBuffer: Buffer;

    if (frame) {
      // Add dark frame with padding
      await page.evaluate(() => {
        document.body.style.padding = "32px";
        document.body.style.background = "#0f0f0f";
        document.body.style.boxSizing = "border-box";
      });
      screenshotBuffer = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1200, height: 630 },
      });
    } else {
      screenshotBuffer = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1200, height: 630 },
      });
    }

    await browser.close();

    return new NextResponse(new Uint8Array(screenshotBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${slug}.png"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("PNG export error:", error);
    return NextResponse.json(
      { error: "Failed to generate PNG screenshot" },
      { status: 500 }
    );
  }
}
