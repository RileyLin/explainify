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

// Fuzzy mapping: content-specific tags → illustration categories
// This maps the granular tags the LLM generates to our 25 illustration topics
const TAG_ALIASES: Record<string, string> = {
  // growth
  "growth-hacking": "growth", scaling: "growth", traction: "growth", acquisition: "growth",
  retention: "retention", churn: "retention", engagement: "retention",
  // leadership
  management: "leadership", ceo: "leadership", founder: "leadership", executive: "leadership",
  "conflict-resolution": "leadership", coaching: "leadership", mentorship: "leadership",
  // strategy
  "business-strategy": "strategy", planning: "strategy", vision: "strategy", roadmap: "strategy",
  competitive: "strategy", moat: "strategy", differentiation: "strategy", pivot: "strategy",
  // design
  ux: "design", ui: "design", "user-experience": "design", "product-design": "design",
  prototyping: "design", wireframe: "design", accessibility: "design",
  // product-management
  product: "product-management", "product-development": "product-management",
  features: "product-management", backlog: "product-management", sprint: "product-management",
  agile: "product-management", scrum: "product-management", roadmapping: "product-management",
  // engineering
  technical: "engineering", architecture: "engineering", infrastructure: "engineering",
  devops: "engineering", "continuous-integration": "engineering", testing: "engineering",
  code: "engineering", software: "engineering", platform: "engineering",
  // startups
  startup: "startups", bootstrapping: "startups", "early-stage": "startups",
  mvp: "startups", "product-market-fit": "startups", launch: "startups",
  publication: "startups", methodology: "startups", adoption: "startups",
  // career
  "career-growth": "career", promotion: "career", "job-search": "career",
  interview: "career", resume: "career", networking: "career", skills: "career",
  // ai
  "machine-learning": "ai", "deep-learning": "ai", llm: "ai", "ai-model": "ai",
  automation: "ai", chatbot: "ai", "generative-ai": "ai",
  // analytics
  data: "analytics", metrics: "metrics", measurement: "analytics", tracking: "analytics",
  dashboard: "analytics", insights: "analytics", experimentation: "analytics",
  // go-to-market
  "go-to-market": "go-to-market", distribution: "go-to-market", channels: "go-to-market",
  "product-launch": "go-to-market", gtm: "go-to-market",
  // pricing
  monetization: "pricing", subscription: "pricing", "business-model": "pricing",
  revenue: "pricing", paywall: "pricing",
  // hiring
  recruiting: "hiring", talent: "hiring", "team-building": "hiring",
  onboarding: "hiring", "company-culture": "culture",
  // marketing
  advertising: "marketing", branding: "marketing", content: "marketing",
  seo: "marketing", "social-media": "marketing", community: "marketing",
  // fundraising
  funding: "fundraising", investors: "fundraising", "venture-capital": "fundraising",
  "series-a": "fundraising", seed: "fundraising",
  // culture
  culture: "culture", values: "culture", diversity: "culture", remote: "culture",
  // ops
  operations: "ops", process: "ops", efficiency: "ops", systems: "ops",
  // sales
  "sales-strategy": "sales", pipeline: "sales", "account-management": "sales",
  negotiation: "sales", closing: "sales", enterprise: "sales",
  // storytelling
  storytelling: "storytelling", narrative: "storytelling", communication: "storytelling",
  presentation: "storytelling", writing: "storytelling", "public-speaking": "storytelling",
  // organization
  "org-design": "organization", structure: "organization", hierarchy: "organization",
};

interface TopicIllustrationProps {
  tags?: string[];
  icon?: string; // Lucide icon name as fallback signal (currently unused, reserved)
  className?: string;
}

export function TopicIllustration({ tags = [], icon: _icon, className }: TopicIllustrationProps) {
  const normalizedTags = tags.map((t) => t.toLowerCase().trim());
  let matchedTag = "default";

  // First pass: exact match against illustration keys
  for (const priority of TAG_PRIORITY) {
    if (normalizedTags.includes(priority)) {
      matchedTag = priority;
      break;
    }
  }

  // Second pass: fuzzy match via aliases
  if (matchedTag === "default") {
    for (const tag of normalizedTags) {
      const alias = TAG_ALIASES[tag];
      if (alias && illustrations[alias]) {
        matchedTag = alias;
        break;
      }
    }
  }

  // Third pass: substring match (e.g., "business-strategy" contains "strategy")
  if (matchedTag === "default") {
    for (const tag of normalizedTags) {
      for (const priority of TAG_PRIORITY) {
        if (tag.includes(priority) || priority.includes(tag)) {
          matchedTag = priority;
          break;
        }
      }
      if (matchedTag !== "default") break;
    }
  }

  const Illustration = illustrations[matchedTag] ?? illustrations["default"]!;

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg overflow-hidden",
        className
      )}
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.04))",
        // Default size; override with className !w-12 !h-12 etc. for inline
        width: className?.includes("!w-") ? undefined : "100%",
        height: className?.includes("!h-") ? undefined : "100px",
      }}
    >
      <Illustration />
    </div>
  );
}
