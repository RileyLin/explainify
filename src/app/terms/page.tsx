import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — VizBrief",
  description: "VizBrief Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block">
          ← Back to VizBrief
        </Link>
        <h1 className="text-3xl font-bold text-foreground mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using VizBrief (&quot;the Service&quot;), operated by Driftworks, Inc, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Description of Service</h2>
            <p>
              VizBrief is an AI-powered tool that transforms technical documentation, code, and complex content into interactive visual diagrams and explainers. The Service is provided as-is and may be updated or changed at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. User Accounts</h2>
            <p>
              You may create an account using GitHub or Google OAuth. You are responsible for maintaining the security of your account and all activity that occurs under it. You must be at least 13 years old to use this Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Content & Intellectual Property</h2>
            <p>
              You retain ownership of the content you submit. By submitting content, you grant Driftworks, Inc a limited license to process and display it as part of the Service. You are responsible for ensuring you have the right to submit any content you provide.
            </p>
            <p className="mt-3">
              The VizBrief platform, interface, and generated explainer templates are the intellectual property of Driftworks, Inc.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Use the Service to generate illegal, harmful, or deceptive content</li>
              <li>Attempt to reverse engineer, scrape, or abuse the API beyond its intended use</li>
              <li>Resell or sublicense API access without written permission</li>
              <li>Circumvent rate limits or access controls</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Free Tier & Pro Subscriptions</h2>
            <p>
              Free tier users receive 5 explainers per month. Pro subscribers receive unlimited explainers at $9/month, billed monthly. Subscriptions can be cancelled at any time. Refunds are handled on a case-by-case basis — contact support@vizbrief.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Disclaimer of Warranties</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. Driftworks, Inc does not guarantee uptime, accuracy of AI-generated content, or fitness for any particular purpose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Driftworks, Inc shall not be liable for any indirect, incidental, or consequential damages arising from use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Contact</h2>
            <p>
              Questions? Email us at <a href="mailto:support@vizbrief.com" className="text-blue-400 hover:underline">support@vizbrief.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
