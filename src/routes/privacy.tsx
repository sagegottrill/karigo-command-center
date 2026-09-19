import { createFileRoute } from "@tanstack/react-router";
import {
  LegalCallout,
  LegalCard,
  LegalLede,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalToc,
} from "@/components/fleetopsx/legal-doc";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — FleetOpsX" },
      {
        name: "description",
        content:
          "How Cravii Food and Logistics Ltd collects, uses and protects information in the FleetOpsX app, and how to request deletion of your account and data.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PrivacyPolicyPage,
});

const TOC = [
  { id: "who-we-are", label: "Who we are" },
  { id: "who-uses", label: "Who uses FleetOpsX" },
  { id: "collect", label: "Information we collect" },
  { id: "use", label: "How we use it" },
  { id: "share", label: "How we share it" },
  { id: "security", label: "Data security" },
  { id: "retention", label: "Data retention" },
  { id: "rights", label: "Your rights and choices" },
  { id: "children", label: "Children's privacy" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact us" },
];

function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="How Cravii Food and Logistics Ltd collects, uses and protects information in the FleetOpsX app."
      effective="18 September 2026"
      appliesTo="the FleetOpsX Android app (com.craviifoods.fleetopsx)"
    >
      <LegalCard>
        <LegalLede>
          FleetOpsX is the mobile companion to Cravii's fleet and logistics operations platform, used by drivers,
          dispatchers, gate security personnel and fleet administrators to submit load requests, track active shipments
          and access delivery records. This policy explains what information the app collects and how it's handled.
        </LegalLede>

        <LegalToc items={TOC} />

        <LegalSection id="who-we-are" number="01" heading="Who we are">
          <p>
            FleetOpsX is developed and operated by <strong>Cravii Food and Logistics Ltd</strong> ("Cravii", "we", "us",
            or "our"), a technology-driven logistics company. This Privacy Policy explains how we collect, use, disclose
            and safeguard information when you download, access or use the FleetOpsX mobile application (the "App"). By
            using FleetOpsX, you agree to the practices described here.
          </p>
        </LegalSection>

        <LegalSection id="who-uses" number="02" heading="Who uses FleetOpsX">
          <p>
            FleetOpsX is built for the drivers, dispatchers, gate security staff and fleet administrators who operate
            within Cravii's logistics network and the businesses we work with. Accounts are issued by an authorised
            administrator as part of an organisation's fleet operations — the app is not intended for general public
            download or personal, non-commercial use.
          </p>
        </LegalSection>

        <LegalSection id="collect" number="03" heading="Information we collect">
          <LegalList
            items={[
              <>
                <strong>Account information</strong> — name, email address, phone number, employee or role ID, job title
                and organisation, provided when your account is created.
              </>,
              <>
                <strong>Operational data</strong> — load and dispatch requests, cargo details, pickup and delivery
                instructions, trip status, vehicle registration and tail numbers, dispatch identifiers, and other fleet
                records you create or that the app generates as you use it.
              </>,
              <>
                <strong>Location data</strong> — with your device's permission, we collect real-time and historical GPS
                location to support live shipment tracking, route visibility and arrival-time estimates.
              </>,
              <>
                <strong>Records and documents</strong> — delivery logs, compliance documents, gate and security dispatch
                records, and other files you upload, view or download through the app.
              </>,
              <>
                <strong>Device and usage information</strong> — device model, operating system version, app version,
                unique device identifiers, crash reports and general diagnostic data, collected automatically to help us
                maintain and improve the app.
              </>,
              <>
                <strong>Authentication data</strong> — credentials used to sign in are transmitted securely to
                authenticate your session. We do not store your password in plain text.
              </>,
            ]}
          />
        </LegalSection>

        <LegalSection id="use" number="04" heading="How we use it">
          <LegalList
            items={[
              "Provide and operate load submission, tracking, records-access and gate security features.",
              "Authenticate accounts and control access to the app.",
              "Monitor and improve app performance, reliability and security.",
              "Generate operational reports for your organisation's fleet administrators.",
              "Send service-related notices, updates and support responses.",
              "Meet legal, safety and regulatory obligations relevant to freight and logistics operations.",
            ]}
          />
        </LegalSection>

        <LegalSection id="share" number="05" heading="How we share it">
          <LegalList
            items={[
              <>
                <strong>Within your organisation</strong> — operational and location data is visible to authorised
                dispatchers, administrators and security personnel within your employer's fleet operation, which is the
                app's core purpose.
              </>,
              <>
                <strong>Service providers</strong> — we may share information with vetted third parties who help us host
                data, process authentication or deliver core services, under obligations to protect it and use it only
                for those purposes.
              </>,
              <>
                <strong>Legal requirements</strong> — we may disclose information where required by law, regulation or
                legal process, or to protect the rights, property or safety of Cravii, our users or the public.
              </>,
            ]}
          />
          <LegalCallout>We do not sell your personal information to third parties.</LegalCallout>
        </LegalSection>

        <LegalSection id="security" number="06" heading="Data security">
          <p>
            We use industry-standard technical and organisational safeguards — including encrypted transmission of data
            between the app and our servers — to protect information from unauthorised access, alteration or loss. No
            method of transmission or storage is completely secure, and we cannot guarantee absolute security.
          </p>
        </LegalSection>

        <LegalSection id="retention" number="07" heading="Data retention">
          <p>
            We retain account, operational and location data for as long as your account remains active and as needed to
            fulfil the purposes described in this policy, including meeting legal, accounting or reporting obligations.
            Data is deleted or anonymised once it is no longer required for these purposes.
          </p>
        </LegalSection>

        <LegalSection id="rights" number="08" heading="Your rights and choices">
          <LegalList
            items={[
              "You may request access to, correction of, or deletion of your personal information, subject to your organisation's records and applicable law, by contacting us using the details below.",
              "Location permissions can be managed or revoked at any time in your device settings, though this may limit the app's tracking features.",
              "Account-level access within the app is managed by your organisation's fleet administrator.",
            ]}
          />
        </LegalSection>

        <LegalSection id="children" number="09" heading="Children's privacy">
          <p>
            FleetOpsX is intended for use by authorised working personnel and is not directed at children. We do not
            knowingly collect personal information from anyone under the age of 18. If you believe a child has provided
            us with personal information, please contact us so we can remove it.
          </p>
        </LegalSection>

        <LegalSection id="changes" number="10" heading="Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices or for legal,
            operational or regulatory reasons. The updated policy will be posted here with a revised effective date, and
            material changes will be communicated through the app or your organisation's administrator.
          </p>
        </LegalSection>

        <LegalSection id="contact" number="11" heading="Contact us">
          <p>If you have questions about this Privacy Policy or how your information is handled, contact us at:</p>
          <p>
            <strong>Cravii Food and Logistics Ltd</strong>
            <br />
            Maiduguri, Borno State, Nigeria
            <br />
            <LegalLink href="mailto:privacy@craviifoods.com">privacy@craviifoods.com</LegalLink>
          </p>
          <p>
            To request deletion of your account and data, see{" "}
            <LegalLink href="/deleteaccount">Account Deletion</LegalLink>.
          </p>
        </LegalSection>
      </LegalCard>
    </LegalPage>
  );
}
