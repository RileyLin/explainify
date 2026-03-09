"use client";

import { Download } from "lucide-react";
import { SocialShareButtons } from "@/components/sharing/social-share";

interface ExplainerFooterProps {
  url: string;
  title: string;
  slug: string;
}

export function ExplainerFooter({ url, title, slug }: ExplainerFooterProps) {
  const pngUrl = `/api/export/${slug}/png`;

  const handleDownloadPng = () => {
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `${slug}.png`;
    a.click();
  };

  return (
    <div className="mt-12 pb-8 space-y-6">
      {/* Share buttons + Download PNG */}
      <div className="flex flex-col items-center gap-3">
        <SocialShareButtons url={url} title={title} slug={slug} />
        <button
          onClick={handleDownloadPng}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 bg-card transition-all"
          title="Download as PNG (1200×630)"
        >
          <Download size={12} />
          Download PNG
        </button>
      </div>

      {/* Made with Explainify - clickable CTA with UTM params */}
      <div className="text-center">
        <a
          href={`/create?utm_source=explainer&utm_medium=watermark&utm_campaign=${slug}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <span>✦</span>
          <span>Made with Explainify</span>
        </a>
      </div>
    </div>
  );
}
