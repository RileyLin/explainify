import { ExplainPageTemplate, generateExplainMetadata } from "@/components/seo/explain-page-template";
export { generateExplainMetadata as generateMetadata };

const props = {
  topic: "Blockchain",
  slug: "blockchain",
  headline: "Explain Blockchain Simply — From Ledgers to Smart Contracts",
  subheadline: "Blockchain is one of the most over-hyped and under-explained technologies of the last decade. VizBrief turns the key concepts into an interactive flow diagram anyone can follow.",
  description: `Blockchain gets explained badly in two directions: either it's dumbed down to "it's like a Google Sheet nobody controls" (missing everything that matters), or it's buried in cryptographic minutiae that loses most readers. The actual concepts — distributed ledgers, consensus mechanisms, hashing, Merkle trees, smart contracts, and the differences between chains — are genuinely graspable once you can see how they connect. VizBrief takes a whitepaper section, an article, or your own explanation of blockchain mechanics and converts it into a step-through interactive diagram. You can navigate from "what a block is" to "how a transaction gets validated" to "what makes this trustless" in a way that prose simply can't achieve.`,
  useCases: [
    "Developers onboarding to Web3 — understanding the stack before writing a line of Solidity",
    "Product managers explaining blockchain-based products to non-technical executives",
    "Finance teams evaluating whether blockchain is the right fit for a given use case",
    "Students and educators in fintech, CS, or economics courses",
    "Journalists and analysts simplifying blockchain news for general audiences",
  ],
  exampleConcepts: [
    "Proof of Work vs Proof of Stake",
    "Smart Contracts",
    "Ethereum Virtual Machine",
    "Merkle Trees",
    "DeFi Protocols",
    "Consensus Mechanisms",
    "Zero-Knowledge Proofs",
    "Layer 2 Scaling",
  ],
  faq: [
    {
      q: "Can VizBrief explain a specific blockchain protocol or whitepaper?",
      a: "Yes. Paste any section of the Bitcoin whitepaper, Ethereum documentation, or a protocol spec and VizBrief will map the key concepts and how they relate. It works especially well for technical documents that have clear cause-and-effect relationships.",
    },
    {
      q: "I need to explain blockchain to my board / investors. Can VizBrief help?",
      a: "Yes — this is one of the best uses. Paste a plain-English description of how your blockchain-based product or process works, and VizBrief generates a visual flow you can share or embed in a deck. It communicates the architecture without requiring your audience to read technical docs.",
    },
    {
      q: "Does it work for DeFi, NFTs, and Web3 topics too?",
      a: "Yes. The AI understands the full Web3 vocabulary. You can explain DeFi lending protocols, NFT minting flows, DAO governance structures, or cross-chain bridges. Any topic with identifiable concepts and relationships will produce a useful diagram.",
    },
    {
      q: "How accurate is the generated diagram?",
      a: "VizBrief extracts structure from the content you provide — it's only as accurate as your source. For authoritative content (official docs, reputable articles), the output is reliable. For complex topics, we recommend reviewing the generated steps before sharing.",
    },
  ],
};

export default function Page() {
  return <ExplainPageTemplate {...props} />;
}
