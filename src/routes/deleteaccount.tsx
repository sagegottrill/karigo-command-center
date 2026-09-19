import { createFileRoute } from "@tanstack/react-router";
import {
  LegalCallout,
  LegalCard,
  LegalLede,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalSteps,
  LegalTable,
} from "@/components/fleetopsx/legal-doc";

export const Route = createFileRoute("/deleteaccount")({
  head: () => ({
    meta: [
      { title: "Account Deletion — FleetOpsX" },
      {
        name: "description",
        content:
          "How to request deletion of your FleetOpsX account and associated data, what is removed, what is retained for compliance, and how long it takes.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: AccountDeletionPage,
});

function AccountDeletionPage() {
  return (
    <LegalPage
      title="Account Deletion"
      subtitle="How to request deletion of your FleetOpsX account and associated data."
      effective="19 September 2026"
      appliesTo="the FleetOpsX Android app (com.craviifoods.fleetopsx)"
    >
      <LegalCard>
        <LegalLede>
          FleetOpsX accounts are issued by your organisation's fleet administrator rather than through
          self-registration in the app. Because of that, there are two ways to request deletion — use whichever is
          available to you.
        </LegalLede>

        <LegalSteps
          steps={[
            {
              title: "Ask your fleet administrator",
              body: (
                <>
                  The quickest route. Your organisation's FleetOpsX administrator can deactivate and remove your account
                  directly from the system.
                </>
              ),
            },
            {
              title: "Email us directly",
              body: (
                <>
                  Send a request to <LegalLink href="mailto:privacy@craviifoods.com">privacy@craviifoods.com</LegalLink>{" "}
                  with the subject line "Account Deletion Request," including your registered email or employee ID and
                  your organisation's name so we can verify you.
                </>
              ),
            },
          ]}
        />

        <LegalSection id="what-deleted" number="01" heading="What gets deleted">
          <p>Once a deletion request is verified, we permanently remove:</p>
          <LegalList
            items={[
              "Your name, email address, phone number and account credentials.",
              "Your profile, role and organisation details.",
              "Location history and device identifiers tied to your account.",
              "Any personal files or records you uploaded that are not required for compliance retention (see below).",
            ]}
          />
        </LegalSection>

        <LegalSection id="what-retained" number="02" heading="What we retain, and why">
          <p>
            Some operational records can't be deleted immediately, because freight, safety and financial record-keeping
            obligations require fleet operators to retain them for a fixed period. These are kept in de-identified or
            aggregate form — no longer linked to you as an individual — until that period ends, then deleted.
          </p>
          <LegalTable
            caption="Records retained after an account deletion request, and for how long"
            columns={["Record type", "Retained for"]}
            rows={[
              ["Completed dispatch & delivery logs", "Up to 3 years, for audit and compliance"],
              ["Gate security dispatch records", "Up to 3 years, for safety and audit compliance"],
              ["Financial/billing records tied to a load", "As required by applicable accounting law"],
            ]}
          />
          <LegalCallout>
            These records are de-identified — they're kept for the fleet operation's compliance needs, not to keep track
            of you personally.
          </LegalCallout>
        </LegalSection>

        <LegalSection id="timeline" number="03" heading="Timeline & confirmation">
          <p>
            Deletion requests are processed within <strong>30 days</strong>. You'll receive an email confirming once your
            personal data has been removed.
          </p>
        </LegalSection>

        <LegalSection id="more" number="04" heading="Related">
          <p>
            For details on what we collect and how it's used while your account is active, see the{" "}
            <LegalLink href="/privacy">FleetOpsX Privacy Policy</LegalLink>.
          </p>
        </LegalSection>
      </LegalCard>
    </LegalPage>
  );
}
