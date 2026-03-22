import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lenny's Archive, Visualized — VizBrief",
  description:
    "638 podcasts and newsletters transformed into interactive visual explainers. Search, explore, and deep dive into any topic. Built for Lenny's Data Challenge.",
  openGraph: {
    title: "Lenny's Archive, Visualized",
    description:
      "638 podcasts and newsletters transformed into interactive visual explainers. Search, explore, and deep dive into any topic.",
    type: "website",
    url: "https://vizbrief.com/library/lennys/showcase",
    images: [
      {
        url: "/og-lennys-showcase.png",
        width: 1200,
        height: 630,
        alt: "Lenny's Archive, Visualized — VizBrief",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lenny's Archive, Visualized — VizBrief",
    description:
      "638 podcasts and newsletters from Lenny's, transformed into interactive visual explainers with fractal deep dive.",
  },
};

export default function LennysShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
