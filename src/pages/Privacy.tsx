import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Privacy Policy" description="Learn how Track Records collects, uses, and protects your data." canonical="/privacy" />
      <Header />
      <main className="container max-w-3xl py-24">
        <h1 className="font-display text-4xl font-bold mb-2 text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: February 2026</p>

        <div className="space-y-10 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">1. What Data We Collect</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Account information</strong> — email address, name, and nationality when you sign up.</li>
              <li><strong className="text-foreground">Driver profile data</strong> — date of birth, racing category, license details, bio, photo, and social links you choose to provide.</li>
              <li><strong className="text-foreground">Race results</strong> — series, season, event names, finishing positions, championship standings, and related metadata.</li>
              <li><strong className="text-foreground">Community submissions</strong> — raw result data pasted by users for admin review.</li>
              <li><strong className="text-foreground">Usage data</strong> — basic analytics such as page views and session duration to improve the platform (no tracking cookies).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">2. How Data Is Gathered</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">User-submitted</strong> — drivers and teams create profiles and add results directly.</li>
              <li><strong className="text-foreground">Admin imports</strong> — administrators import official results from publicly available sources (e.g., timing sheets, federation websites).</li>
              <li><strong className="text-foreground">AI-powered scraping</strong> — we use AI to parse and structure publicly available race results from official series websites. Only publicly accessible data is collected.</li>
              <li><strong className="text-foreground">Community contributions</strong> — users can submit raw results data, which is reviewed and verified by administrators before being added to the platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">3. How Data Is Used</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Building comprehensive, verified driver profiles.</li>
              <li>Enabling teams and sponsors to search and discover drivers by category, nationality, and performance.</li>
              <li>Verification of race results by administrators.</li>
              <li>Improving the platform experience based on usage patterns.</li>
            </ul>
            <p className="mt-3 text-muted-foreground">We <strong className="text-foreground">never sell</strong> your personal data to third parties.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">4. How Data Is Protected</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Authentication</strong> — all accounts are protected with secure email-based authentication.</li>
              <li><strong className="text-foreground">Row-Level Security (RLS)</strong> — database policies ensure users can only access and modify data they are authorised to.</li>
              <li><strong className="text-foreground">Encrypted connections</strong> — all data in transit is encrypted via HTTPS/TLS.</li>
              <li><strong className="text-foreground">Access control</strong> — admin-only actions (verification, imports, user management) are restricted by role-based permissions.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">5. Third-Party Services</h2>
            <p className="text-muted-foreground">
              We use the following third-party services to operate the platform:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2 text-muted-foreground">
              <li><strong className="text-foreground">Authentication provider</strong> — secure login and account management.</li>
              <li><strong className="text-foreground">AI processing</strong> — used to parse and structure race result data from public sources. No personal data is shared with AI providers beyond what is publicly available.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">6. Cookies</h2>
            <p className="text-muted-foreground">
              We use <strong className="text-foreground">minimal cookies</strong> — only what is necessary for session authentication. We do not use tracking cookies, advertising cookies, or third-party analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">7. Your Rights</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Request edits or corrections to your driver profile.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Ask what personal data we hold about you.</li>
              <li>Withdraw consent for data processing at any time.</li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@trackrecord.com" className="text-primary underline hover:text-primary/80 transition-colors">
                privacy@trackrecord.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-foreground">8. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this privacy policy from time to time. Any changes will be reflected on this page with an updated revision date. Continued use of the platform after changes constitutes acceptance of the revised policy.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
