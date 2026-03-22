"use client";

import { cn } from "@/lib/utils";
import {
  GrowthIllustration,
  LeadershipIllustration,
  StrategyIllustration,
  DesignIllustration,
  ProductManagementIllustration,
  EngineeringIllustration,
  StartupsIllustration,
  CareerIllustration,
  AiIllustration,
  AnalyticsIllustration,
  GoToMarketIllustration,
  PricingIllustration,
  B2BIllustration,
  B2CIllustration,
  HiringIllustration,
  OrganizationIllustration,
  MarketingIllustration,
  FundraisingIllustration,
  CultureIllustration,
  OpsIllustration,
  SalesIllustration,
  RetentionIllustration,
  MetricsIllustration,
  StorytellingIllustration,
  DefaultIllustration,
} from "./illustrations";

// Map of tag slug → illustration component
export const illustrations: Record<string, React.ComponentType> = {
  growth: GrowthIllustration,
  leadership: LeadershipIllustration,
  strategy: StrategyIllustration,
  design: DesignIllustration,
  "product-management": ProductManagementIllustration,
  engineering: EngineeringIllustration,
  startups: StartupsIllustration,
  career: CareerIllustration,
  ai: AiIllustration,
  analytics: AnalyticsIllustration,
  "go-to-market": GoToMarketIllustration,
  pricing: PricingIllustration,
  b2b: B2BIllustration,
  b2c: B2CIllustration,
  hiring: HiringIllustration,
  organization: OrganizationIllustration,
  marketing: MarketingIllustration,
  fundraising: FundraisingIllustration,
  culture: CultureIllustration,
  ops: OpsIllustration,
  sales: SalesIllustration,
  retention: RetentionIllustration,
  metrics: MetricsIllustration,
  storytelling: StorytellingIllustration,
  default: DefaultIllustration,
};

// Priority order — more specific/visual topics rendered first
const TAG_PRIORITY = [
  "ai",
  "engineering",
  "growth",
  "strategy",
  "product-management",
  "design",
  "analytics",
  "leadership",
  "go-to-market",
  "pricing",
  "hiring",
  "startups",
  "career",
  "fundraising",
  "marketing",
  "sales",
  "retention",
  "metrics",
  "storytelling",
  "culture",
  "ops",
  "organization",
  "b2b",
  "b2c",
];

interface TopicIllustrationProps {
  tags?: string[];
  icon?: string; // Lucide icon name as fallback signal (currently unused, reserved)
  className?: string;
}

export function TopicIllustration({ tags = [], icon: _icon, className }: TopicIllustrationProps) {
  // Find best matching tag by priority order
  const normalizedTags = tags.map((t) => t.toLowerCase().trim());
  let matchedTag = "default";
  for (const priority of TAG_PRIORITY) {
    if (normalizedTags.includes(priority)) {
      matchedTag = priority;
      break;
    }
  }

  const Illustration = illustrations[matchedTag] ?? illustrations["default"]!;

  return (
    <div
      className={cn(
        "w-full h-[100px] flex items-center justify-center rounded-lg overflow-hidden",
        className
      )}
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.04))",
      }}
    >
      <Illustration />
    </div>
  );
}
