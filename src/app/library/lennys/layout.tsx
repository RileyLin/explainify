import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lenny's Visual Library — VizBrief",
  description:
    "Explore 638 podcasts and newsletters from Lenny's Podcast & Newsletter, visualized as interactive explainers.",
  openGraph: {
    title: "Lenny's Visual Library",
    description:
      "638 podcasts and newsletters, visualized. Explore every topic from product strategy to engineering leadership.",
    type: "website",
    url: "https://vizbrief.com/library/lennys",
    images: [
      {
        url: "/og-lennys-library.png",
        width: 1200,
        height: 630,
        alt: "Lenny's Visual Library on VizBrief",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lenny's Visual Library — VizBrief",
    description:
      "638 podcasts and newsletters from Lenny's, visualized as interactive explainers.",
  },
};

export default function LennysLibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
