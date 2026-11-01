import { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Eyebrow, Page } from "@/site/ui";

const SECTIONS = [
  { id: "summary", title: "In short" },
  { id: "data-we-publish", title: "What we publish" },
  { id: "data-from-visitors", title: "What we collect from visitors" },
  { id: "third-party-services", title: "Third-party services" },
  { id: "advertising", title: "Advertising and cookies" },
  { id: "your-rights", title: "Corrections, removal and your rights" },
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
      <SEOHead title="Privacy Policy" description="Track Records has no accounts and collects no personal details. How we publish race data, and how Google advertising uses cookies." canonical="/privacy" />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <Eyebrow>Legal · Last updated <span className="num text-ink">November 2026</span></Eyebrow>
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
              <p>
                Track Records is a free, public archive of motorsport results. There are <strong>no accounts</strong>: we don&apos;t ask you to sign up,
                and we don&apos;t collect your name, email address or any other personal details through the site. The site shows advertising served by Google,
                which may use cookies. We <strong>never sell</strong> personal data.
              </p>
            </Section>

            <Section index={1}>
              <ul>
                <li>
                  <strong>Race data</strong>: results, lap times, pit stops, flags, weather and standings, taken from official timing and scoring published by the
                  series organisers.
                </li>
                <li>
                  <strong>Competitor information</strong>: the names, nationalities and teams of drivers as published in those official results. For some drivers we
                  also show a date of birth or hometown, taken from publicly available sources.
                </li>
                <li>
                  <strong>Derived statistics</strong>: records, standings and the driver &quot;fingerprint&quot; scores are calculated by us from the published results.
                </li>
              </ul>
            </Section>

            <Section index={2}>
              <ul>
                <li>
                  <strong>Nothing you type is stored by us.</strong> Search happens in your browser, and the site has no forms that send data to us.
                </li>
                <li>
                  <strong>Your preferences</strong>: your choice of day or night mode is kept in your browser&apos;s local storage. It never leaves your device.
                </li>
                <li>
                  <strong>We don&apos;t run our own analytics</strong> or tracking scripts.
                </li>
              </ul>
            </Section>

            <Section index={3}>
              <p>Loading the site involves these providers, each of which receives your IP address as part of normal web requests:</p>
              <ul>
                <li>
                  <strong>GitHub Pages</strong> hosts the site and may log requests for security and reliability (see{" "}
                  <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                    GitHub&apos;s privacy statement
                  </a>
                  ).
                </li>
                <li>
                  <strong>Google Fonts</strong> serves the typefaces.
                </li>
                <li>
                  <strong>flagcdn.com</strong> serves the national flag images.
                </li>
                <li>
                  <strong>Google AdSense</strong> serves advertising (see below).
                </li>
              </ul>
            </Section>

            <Section index={4}>
              <p>
                Advertising on Track Records is provided by Google AdSense. Google and its partners may use cookies or similar technologies to show ads, limit how
                often you see them and measure their performance, including ads based on your visits to this and other websites.
              </p>
              <ul>
                <li>
                  Learn how Google uses this information in{" "}
                  <a href="https://policies.google.com/technologies/partner-sites" className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                    How Google uses information from sites that use its services
                  </a>
                  .
                </li>
                <li>
                  You can turn off personalised ads at{" "}
                  <a href="https://adssettings.google.com" className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                    Google Ads Settings
                  </a>{" "}
                  or opt out of third-party vendors at{" "}
                  <a href="https://www.aboutads.info/choices" className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                    aboutads.info
                  </a>
                  .
                </li>
                <li>You can also block or delete cookies in your browser settings; the site works without them.</li>
              </ul>
            </Section>

            <Section index={5}>
              <ul>
                <li>Spotted a wrong result or name? Tell us and we&apos;ll correct it against the official records.</li>
                <li>
                  If you are a driver or team listed here, you can ask us to correct or remove personal details that aren&apos;t part of the official results,
                  such as a date of birth or hometown.
                </li>
                <li>Depending on where you live, you may have further rights over personal data; contact us and we&apos;ll help.</li>
              </ul>
              <p>
                Contact:{" "}
                <a href="mailto:privacy@track-records.com" className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                  privacy@track-records.com
                </a>
                .
              </p>
            </Section>

            <Section index={6}>
              <p>
                If we change how the site handles data, we&apos;ll update this page and the date at the top. The data itself is kept in a public repository, so every
                change to it is on the record too.
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
