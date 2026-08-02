"use client";

import { useState } from "react";
import { Copy, Check, Twitter, Linkedin, Repeat2 } from "lucide-react";

interface SocialShareProps {
  url: string;
  title: string;
  slug: string;
}

export function SocialShareButtons({ url, title, slug }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const tweetText = encodeURIComponent(`${title}\n\n${url}`);
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemix = () => {
    // Store the slug in sessionStorage so the create page can load it
    sessionStorage.setItem("explainify_remix_slug", slug);
    window.location.href = "/create?remix=" + slug;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Twitter / X */}
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
      >
        <Twitter size={14} />
        Share on X
      </a>

      {/* LinkedIn */}
      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
      >
        <Linkedin size={14} />
        LinkedIn
      </a>

      {/* Copy Link */}
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
      >
        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        {copied ? "Copied!" : "Copy Link"}
      </button>

      {/* Remix */}
      <button
        onClick={handleRemix}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-sm text-blue-500 hover:bg-blue-500/20 transition-all font-medium"
      >
        <Repeat2 size={14} />
        Remix
      </button>
    </div>
  );
}
