import { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Eyebrow, Page } from "@/site/ui";

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
  "space-y-4 text-[17px] leading-[1.75] text-ink/85 [&_strong]:font-semibold [&_strong]:text-ink " +
  "[&_ul]:space-y-3 [&_li]:relative [&_li]:pl-6 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.85em] [&_li]:before:h-px [&_li]:before:w-3 [&_li]:before:bg-ink-3";

function Section({ index, children }: { index: number; children: ReactNode }) {
  const s = SECTIONS[index];
  return (
    <section id={s.id} className="scroll-mt-28">
      <div className="num text-xs text-ink-3">{String(index + 1).padStart(2, "0")}</div>
      <h2 className="display mb-5 mt-2 text-[2.1rem] leading-[1.02] sm:text-[2.5rem]">{s.title}</h2>
      <div className={PROSE}>{children}</div>
    </section>
  );
}

const Privacy = () => {
  return (
    <div className="min-h-screen">
      <SEOHead title="Privacy Policy" description="Learn how Track Records collects, uses, and protects your data." canonical="/privacy" />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <Eyebrow>Legal · Last updated <span className="num text-ink">February 2026</span></Eyebrow>
        <h1 className="display mt-4 text-[3.2rem] leading-[0.92] sm:text-[5rem] lg:text-[6rem]">
          Privacy <em>policy.</em>
        </h1>
      </Page>

      <Page className="mt-14 sm:mt-20">
        <div className="grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-20">
          <nav aria-label="Contents" className="lg:sticky lg:top-28 lg:self-start">
            <div className="eyebrow mb-3">Contents</div>
            <ol className="overflow-hidden rounded-2xl border bg-sheet lg:rounded-none lg:border-0 lg:bg-transparent">
              {SECTIONS.map((s, i) => (
                <li key={s.id} className="border-b last:border-b-0 lg:border-b-0">
                  <a href={`#${s.id}`} className="flex gap-3 px-4 py-2.5 text-[14px] text-ink-2 transition-colors hover:text-ink lg:px-0 lg:py-1.5">
                    <span className="num pt-px text-[11px] leading-5 text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 max-w-[40rem] space-y-14">
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
                <a href="mailto:privacy@trackrecord.com" className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
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
      </Page>
      <Footer />
    </div>
  );
};

export default Privacy;
