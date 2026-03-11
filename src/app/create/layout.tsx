import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Explainer — VizBrief",
  description: "Paste any technical doc, code, or architecture spec and get an interactive visual explainer in seconds.",
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
