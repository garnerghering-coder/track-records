import { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { PageHeader } from "@/components/tr/primitives";

const SECTIONS = [
  { id: "data-we-collect", title: "What data we collect" },
  { id: "how-data-is-gathered", title: "How data is gathered" },
  { id: "how-data-is-used", title: "How data is used" },
  { id: "how-data-is-protected", title: "How data is protected" },
  { id: "third-party-services", title: "Third-party services" },
  { id: "cookies", title: "Cookies" },
  { id: "your-rights", title: "Your rights" },
  { id: "changes", title: "Changes to this policy" },
];

/* Reading styles shared by every section body */
const PROSE =
  "space-y-4 text-[17px] leading-[1.7] text-foreground/85 [&_strong]:font-semibold [&_strong]:text-foreground " +
  "[&_ul]:space-y-2.5 [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.8em] [&_li]:before:h-px [&_li]:before:w-2.5 [&_li]:before:bg-primary";

function Section({ index, children }: { index: number; children: ReactNode }) {
  const s = SECTIONS[index];
  return (
    <section id={s.id} className="scroll-mt-20 border-t pt-8 first:border-t-0 first:pt-0">
      <h2 className="mb-4 flex items-baseline gap-3 font-display text-[1.65rem] font-bold uppercase leading-tight tracking-wide text-foreground">
        <span className="num text-sm font-normal text-primary">{String(index + 1).padStart(2, "0")}</span>
        {s.title}
      </h2>
      <div className={PROSE}>{children}</div>
    </section>
  );
}

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Privacy Policy" description="Learn how Track Records collects, uses, and protects your data." canonical="/privacy" />
      <Header />

      <PageHeader
        kicker={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Legal
          </>
        }
        title="Privacy policy"
        meta={
          <span>
            Last updated <span className="num text-foreground">February 2026</span>
          </span>
        }
      />

      <main className="container py-10 md:py-12">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
          {/* Contents */}
          <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
            <div className="label-caps mb-2">Contents</div>
            <ol className="divide-y overflow-hidden rounded border bg-card">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex gap-2.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <span className="num text-xs leading-5 text-primary">{String(i + 1).padStart(2, "0")}</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-[68ch] space-y-10">
            <Section index={0}>
              <ul>
                <li><strong>Account information</strong> — email address, name, and nationality when you sign up.</li>
                <li><strong>Driver profile data</strong> — date of birth, racing category, license details, bio, photo, and social links you choose to provide.</li>
                <li><strong>Race results</strong> — series, season, event names, finishing positions, championship standings, and related metadata.</li>
                <li><strong>Community submissions</strong> — raw result data pasted by users for admin review.</li>
                <li><strong>Usage data</strong> — basic analytics such as page views and session duration to improve the platform (no tracking cookies).</li>
              </ul>
            </Section>

            <Section index={1}>
              <ul>
                <li><strong>User-submitted</strong> — drivers and teams create profiles and add results directly.</li>
                <li><strong>Admin imports</strong> — administrators import official results from publicly available sources (e.g., timing sheets, federation websites).</li>
                <li><strong>AI-powered scraping</strong> — we use AI to parse and structure publicly available race results from official series websites. Only publicly accessible data is collected.</li>
                <li><strong>Community contributions</strong> — users can submit raw results data, which is reviewed and verified by administrators before being added to the platform.</li>
              </ul>
            </Section>

            <Section index={2}>
              <ul>
                <li>Building comprehensive, verified driver profiles.</li>
                <li>Enabling teams and sponsors to search and discover drivers by category, nationality, and performance.</li>
                <li>Verification of race results by administrators.</li>
                <li>Improving the platform experience based on usage patterns.</li>
              </ul>
              <p>
                We <strong>never sell</strong> your personal data to third parties.
              </p>
            </Section>

            <Section index={3}>
              <ul>
                <li><strong>Authentication</strong> — all accounts are protected with secure email-based authentication.</li>
                <li><strong>Row-Level Security (RLS)</strong> — database policies ensure users can only access and modify data they are authorised to.</li>
                <li><strong>Encrypted connections</strong> — all data in transit is encrypted via HTTPS/TLS.</li>
                <li><strong>Access control</strong> — admin-only actions (verification, imports, user management) are restricted by role-based permissions.</li>
              </ul>
            </Section>

            <Section index={4}>
              <p>We use the following third-party services to operate the platform:</p>
              <ul>
                <li><strong>Authentication provider</strong> — secure login and account management.</li>
                <li><strong>AI processing</strong> — used to parse and structure race result data from public sources. No personal data is shared with AI providers beyond what is publicly available.</li>
              </ul>
            </Section>

            <Section index={5}>
              <p>
                We use <strong>minimal cookies</strong> — only what is necessary for session authentication. We do not use tracking cookies, advertising cookies, or third-party analytics cookies.
              </p>
            </Section>

            <Section index={6}>
              <ul>
                <li>Request edits or corrections to your driver profile.</li>
                <li>Request deletion of your account and associated data.</li>
                <li>Ask what personal data we hold about you.</li>
                <li>Withdraw consent for data processing at any time.</li>
              </ul>
              <p>
                To exercise any of these rights, contact us at{" "}
                <a href="mailto:privacy@trackrecord.com" className="text-primary underline decoration-primary/40 underline-offset-[3px] hover:decoration-primary">
                  privacy@trackrecord.com
                </a>
                .
              </p>
            </Section>

            <Section index={7}>
              <p>
                We may update this privacy policy from time to time. Any changes will be reflected on this page with an updated revision date. Continued use of the platform after changes constitutes acceptance of the revised policy.
              </p>
            </Section>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
