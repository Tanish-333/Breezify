import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service: Breezify",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 30, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Breezify
        (&quot;Breezify,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), including our
        website, dashboard, and any applications generated through the service
        (collectively, the &quot;Service&quot;). By creating an account or otherwise using the
        Service, you agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. Eligibility and age requirements</h2>
      <p>
        You must be at least 13 years old to create an account or use the Service. If you
        are between 13 and 17 years old, you may only use the Service with the involvement
        and consent of a parent or legal guardian, who must review and agree to these Terms
        on your behalf and take responsibility for your use of the Service. If you are
        creating an account on behalf of a company or other legal entity, you represent that
        you have the authority to bind that entity to these Terms.
      </p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account credentials
        and for all activity that occurs under your account. Notify us immediately if you
        suspect unauthorized use of your account. We support account creation via email and
        password, and via Google and GitHub sign-in.
      </p>

      <h2>3. Credits, billing, and generation</h2>
      <p>
        New accounts receive an initial allotment of free credit. Generating an application
        consumes credit at a rate that depends on the AI model selected. Once your balance is
        exhausted, you may purchase additional credit or subscribe to a paid plan to continue
        generating applications. Prices are shown at the time of purchase and are subject to
        change with notice. Credits are non-transferable and, except where required by law,
        non-refundable.
      </p>

      <h2>4. Generated content and ownership</h2>
      <p>
        Subject to these Terms, you own the code and applications generated for you through
        the Service based on your prompts. You are responsible for reviewing generated code
        before deploying or relying on it, including for security, correctness, and
        compliance with any applicable law. We make no guarantee that generated code is free
        of defects or suitable for any particular purpose.
      </p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not use the Service to generate or deploy unlawful, fraudulent, or malicious applications.</li>
        <li>Do not attempt to circumvent credit limits, rate limits, or account restrictions.</li>
        <li>Do not use the Service to infringe the intellectual property or privacy rights of others.</li>
        <li>Do not use the Service to build tools intended to abuse, attack, or gain unauthorized access to other systems.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these Terms or that we reasonably
        believe pose a risk to the Service, other users, or third parties.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The Service relies on third-party providers, including Firebase (authentication and
        data storage), Anthropic, Google, and Groq (AI model generation), and Vercel (hosting
        the Breezify platform and, for deployed apps, deployed applications).
        Your use of the Service is also subject to the acceptable use policies of these
        providers where applicable.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any
        kind, whether express or implied, including warranties of merchantability, fitness
        for a particular purpose, and non-infringement. We do not warrant that the Service
        will be uninterrupted, error-free, or secure.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Breezify and its affiliates will not be
        liable for any indirect, incidental, special, consequential, or punitive damages, or
        any loss of profits or data, arising from your use of the Service, even if advised of
        the possibility of such damages.
      </p>

      <h2>9. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material changes, we will
        provide notice through the Service or by other reasonable means. Continued use of the
        Service after changes take effect constitutes acceptance of the revised Terms.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time from your account
        settings. We may suspend or terminate your access to the Service for violation of
        these Terms or for any other reason with reasonable notice, except where immediate
        termination is warranted to protect the Service or other users.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms can be sent through our{" "}
        <Link href="/help" className="underline underline-offset-2">
          Help page
        </Link>
        .
      </p>
    </LegalPage>
  );
}
