"use client";

import { Download } from "lucide-react";
import { SocialShareButtons } from "@/components/sharing/social-share";

interface ExplainerFooterProps {
  url: string;
  title: string;
  slug: string;
  onDownloadPng?: () => void;
}

export function ExplainerFooter({ url, title, slug, onDownloadPng }: ExplainerFooterProps) {
  const handleDownloadPng = () => {
    if (onDownloadPng) {
      onDownloadPng();
    } else {
      // Fallback to server-side export (may not work on Vercel)
      const a = document.createElement("a");
      a.href = `/api/export/${slug}/png`;
      a.download = `${slug}.png`;
      a.click();
    }
  };

  return (
    <div className="mt-12 pb-8 space-y-6">
      {/* Share buttons + Download PNG */}
      <div className="flex flex-col items-center gap-3">
        <SocialShareButtons url={url} title={title} slug={slug} />
        <button
          onClick={handleDownloadPng}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 bg-card transition-all active:scale-95 touch-manipulation"
          title="Download as PNG"
        >
          <Download size={16} />
          Download PNG
        </button>
      </div>

      {/* Made with VizBrief - clickable CTA with UTM params */}
      <div className="text-center">
        <a
          href={`/create?utm_source=explainer&utm_medium=watermark&utm_campaign=${slug}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <span>✦</span>
          <span>Made with VizBrief</span>
        </a>
      </div>
    </div>
  );
}
