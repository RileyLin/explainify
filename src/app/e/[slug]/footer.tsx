"use client";

import { SocialShareButtons } from "@/components/sharing/social-share";

interface ExplainerFooterProps {
  url: string;
  title: string;
  slug: string;
}

export function ExplainerFooter({ url, title, slug }: ExplainerFooterProps) {
  return (
    <div className="mt-12 pb-8 space-y-6">
      {/* Share buttons */}
      <div className="flex justify-center">
        <SocialShareButtons url={url} title={title} slug={slug} />
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
