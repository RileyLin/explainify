import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — VizBrief",
  description: "VizBrief Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block">
          ← Back to VizBrief
        </Link>
        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Information We Collect</h2>
            <p>When you use VizBrief, we collect:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-foreground">Account info:</strong> Name and email from GitHub or Google OAuth when you sign in</li>
              <li><strong className="text-foreground">Content you submit:</strong> Text, code, or documentation you paste to generate explainers</li>
              <li><strong className="text-foreground">Generated explainers:</strong> The structured JSON and published explainer data</li>
              <li><strong className="text-foreground">Usage data:</strong> Number of explainers created, template choices, feature usage</li>
              <li><strong className="text-foreground">Technical data:</strong> IP address, browser type, referring URL</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>To provide and operate the VizBrief service</li>
              <li>To process your content through AI to generate explainers</li>
              <li>To enforce rate limits and manage subscriptions</li>
              <li>To improve the product (aggregate, anonymized usage patterns)</li>
              <li>To send transactional emails (account-related only — no marketing without consent)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Content Processing</h2>
            <p>
              Content you submit is sent to AI providers (Anthropic Claude via AWS Bedrock or OpenAI) to generate explainers. We do not use your content to train AI models. Content submitted via the API or create page is processed transiently and stored only if you choose to publish or save it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Data Sharing</h2>
            <p>We do not sell your personal data. We share data only with:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-foreground">Supabase:</strong> Database storage (SOC 2 compliant)</li>
              <li><strong className="text-foreground">AWS:</strong> Cloud infrastructure and AI processing</li>
              <li><strong className="text-foreground">Stripe:</strong> Payment processing for Pro subscriptions</li>
              <li><strong className="text-foreground">Vercel:</strong> Hosting and edge delivery</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Public Explainers</h2>
            <p>
              Explainers you publish publicly are accessible to anyone with the link. They include the title, summary, and diagram content you generated. Private explainers (saved to dashboard only) are not publicly accessible.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Data Retention</h2>
            <p>
              Account data is retained as long as your account is active. Published explainers are retained indefinitely unless you delete them from your dashboard. You may request deletion of your account and all associated data by emailing support@vizbrief.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Cookies</h2>
            <p>
              We use session cookies for authentication (NextAuth.js). We do not use third-party tracking cookies or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Your Rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal data at any time by contacting <a href="mailto:support@vizbrief.com" className="text-blue-400 hover:underline">support@vizbrief.com</a>. EU/EEA users have additional rights under GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Security</h2>
            <p>
              We use industry-standard security practices including HTTPS, encrypted storage, and access controls. No system is perfectly secure — please use a strong, unique password for your OAuth provider accounts.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Contact</h2>
            <p>
              Privacy questions: <a href="mailto:support@vizbrief.com" className="text-blue-400 hover:underline">support@vizbrief.com</a>
              <br />Driftworks, Inc — Seattle, WA
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
