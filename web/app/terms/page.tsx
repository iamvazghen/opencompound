import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Terms — OpenCompound",
  description: "Terms of use for the OpenCompound interface.",
};

export default function TermsPage() {
  return (
    <>
      <Nav />
      <article className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-6 py-12 text-[var(--color-ink-2)] [&_h2]:mt-8 [&_h2]:text-[var(--color-ink)] [&_strong]:text-[var(--color-ink)]">
        <h1 className="text-[var(--text-display-s)] text-[var(--color-ink)]">Terms of use</h1>
        <p>
          OpenCompound is an open-source, educational interface to permissionless smart contracts. By
          using it you accept these terms. If you do not agree, do not use the interface.
        </p>

        <h2>As-is, no warranty</h2>
        <p>
          The interface and contracts are provided <strong>&quot;as is&quot;</strong>, without warranty
          of any kind. To the maximum extent permitted by law, the authors are <strong>not liable</strong>
          for any loss arising from use of the software, including loss of funds from liquidation, bugs,
          or third-party failures.
        </p>

        <h2>Non-custodial</h2>
        <p>
          OpenCompound never takes custody of your funds or private keys. You transact directly with
          on-chain contracts from your own wallet and are responsible for every transaction you sign.
        </p>

        <h2>No advice, your responsibility</h2>
        <p>
          Nothing here is financial, legal, or tax advice. You are responsible for evaluating the risks
          (see the <a href="/risk" className="text-[var(--color-accent)] hover:underline">Risk disclosure</a>)
          and for complying with the laws of your jurisdiction. Do not use the interface where doing so
          would be unlawful.
        </p>

        <h2>Eligibility</h2>
        <p>
          You represent that you are of legal age and not a person barred from using the protocol under
          applicable sanctions or securities laws. Access may be restricted in some jurisdictions.
        </p>

        <h2>Changes</h2>
        <p>
          These terms and the software may change at any time. Continued use after a change constitutes
          acceptance of the updated terms.
        </p>
      </article>
    </>
  );
}
