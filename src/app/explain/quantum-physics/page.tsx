import { ExplainPageTemplate, generateExplainMetadata } from "@/components/seo/explain-page-template";
export { generateExplainMetadata as generateMetadata };

const props = {
  topic: "Quantum Physics",
  slug: "quantum-physics",
  headline: "Explain Quantum Physics Simply — No PhD Required",
  subheadline: "Quantum mechanics is famously confusing even to physicists. VizBrief turns dense quantum concepts into interactive step-through diagrams that actually click.",
  description: `Quantum physics describes how matter and energy behave at the subatomic scale — and it breaks almost every intuition built from everyday life. Superposition, entanglement, wave-particle duality, the uncertainty principle: these ideas are genuinely counterintuitive, and most explanations either oversimplify them to the point of being wrong, or bury them in mathematics. The result is that students, engineers building quantum software, and curious learners all struggle to build a solid mental model. VizBrief takes a doc, textbook section, or your own notes about quantum physics and converts it into an interactive node diagram that shows how the concepts connect — making relationships visible that walls of text hide.`,
  useCases: [
    "Physics students building intuition for wave functions, spin, and measurement",
    "Software engineers working with quantum computing frameworks (Qiskit, Cirq, PennyLane)",
    "Teachers creating visual explanations for quantum mechanics courses",
    "Science communicators turning papers or lecture notes into shareable explainers",
    "Product teams explaining quantum-adjacent products to non-technical stakeholders",
  ],
  exampleConcepts: [
    "Quantum Entanglement",
    "Schrödinger's Equation",
    "Quantum Superposition",
    "Wave-Particle Duality",
    "Quantum Computing",
    "The Uncertainty Principle",
    "Quantum Tunneling",
    "Spin and Qubits",
  ],
  faq: [
    {
      q: "Do I need to understand quantum physics to use VizBrief?",
      a: "No. You paste the source material — a Wikipedia article, textbook section, or lecture notes — and VizBrief extracts the structure. The output is a visual map of how the concepts connect, which helps you build understanding from scratch.",
    },
    {
      q: "Can I paste a full textbook chapter?",
      a: "Yes. VizBrief handles long-form content well. It identifies the most important concepts and relationships, then builds a navigable diagram. For very long content it may focus on the core thread — you can adjust which sections to emphasize.",
    },
    {
      q: "How is this different from a mind map?",
      a: "Mind maps are static and require you to build them manually. VizBrief generates an animated, interactive flow diagram from your text automatically — with step-through navigation, labels, and shareable links. It's the difference between drawing a diagram and having one generated for you in seconds.",
    },
    {
      q: "Can I embed a quantum physics explainer in my course or website?",
      a: "Yes. Every published VizBrief explainer has a shareable URL and an embed code (one line of HTML). Your readers get the full interactive experience without leaving your site.",
    },
  ],
};

export default function Page() {
  return <ExplainPageTemplate {...props} />;
}
