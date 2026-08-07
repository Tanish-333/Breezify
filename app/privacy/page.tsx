import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy: Breezify",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 30, 2026">
      <p>
        This Privacy Policy describes how Breezify (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
        collects, uses, and shares information when you use our website, dashboard, and
        related services (the &quot;Service&quot;).
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong className="text-foreground">Account information:</strong> your name, email
          address, profile photo, and authentication provider (email, Google, or GitHub),
          collected when you sign up.
        </li>
        <li>
          <strong className="text-foreground">Usage data:</strong> the prompts you submit,
          the applications and code generated for you, your credit balance and transaction
          history, and general activity such as sign-in times.
        </li>
        <li>
          <strong className="text-foreground">Payment information:</strong> when you
          purchase credit or subscribe to a paid plan, payment is processed by our payment
          provider; we do not store full payment card numbers ourselves.
        </li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To authenticate you and operate your account.</li>
        <li>To generate applications from your prompts using our AI provider.</li>
        <li>To track credit usage, billing, and transaction history.</li>
        <li>To maintain the security and reliability of the Service.</li>
        <li>To communicate with you about your account, such as email verification and password reset.</li>
      </ul>

      <h2>3. How we share your information</h2>
      <p>
        We share information with service providers who help us operate Breezify,
        including Firebase and Google Cloud (authentication and data storage), Anthropic,
        Google, and Groq (processing prompts to generate applications), and Vercel (hosting
        deployed applications). We do not sell your personal information. We may disclose
        information if required by law or to protect the rights, property, or safety of
        Breezify, our users, or the public.
      </p>

      <h2>4. Data retention</h2>
      <p>
        We retain account and usage data for as long as your account is active. If you delete
        your account, we delete your profile, generated apps, and transaction history from
        our systems, except where retention is required for legal, accounting, or fraud
        prevention purposes.
      </p>

      <h2>5. Your choices</h2>
      <p>
        You can review and update your account information from your settings page at any
        time. You can permanently delete your account and associated data from the same page.
        You can also request a copy of the personal information we hold about you by
        contacting us.
      </p>

      <h2>6. Children&apos;s privacy</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect
        personal information from children under 13. Users between 13 and 17 may only use the
        Service with the involvement of a parent or guardian, as described in our Terms of
        Service. If we learn that we have collected personal information from a child under
        13 without appropriate consent, we will delete it.
      </p>

      <h2>7. Security</h2>
      <p>
        We use industry-standard measures, including Firebase Authentication and Firestore
        security rules, to protect your information. No method of transmission or storage is
        completely secure, and we cannot guarantee absolute security.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes, we
        will provide notice through the Service or by other reasonable means.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about this Privacy Policy can be sent through our{" "}
        <Link href="/help" className="underline underline-offset-2">
          Help page
        </Link>
        .
      </p>
    </LegalPage>
  );
}
