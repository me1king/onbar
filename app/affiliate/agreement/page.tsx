import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { AFFILIATE_AGREEMENT_VERSION } from '@/lib/affiliateAgreement';

const sections = [
  {
    title: '1. Purpose of the Agreement',
    paragraphs: [
      'ONBAR operates a digital commerce platform and may operate an affiliate and partner programme. Approved partners may promote ONBAR using approved referral methods and may earn commission on completed, verified qualifying sales.',
      'This draft explains referral tracking, commission eligibility, payouts, dashboard information, partner responsibilities, prohibited activity, termination, confidentiality and personal-data handling.'
    ]
  },
  {
    title: '2. Independent Partner Relationship',
    paragraphs: [
      'The Affiliate is an independent partner, not an employee, agent, franchisee or legal representative of ONBAR. Nothing in this Agreement creates an employment relationship, partnership, joint venture or authority to bind ONBAR.',
      'The Affiliate must not describe themselves as an ONBAR employee, director, owner, spokesperson or authorized representative unless ONBAR expressly authorizes this in writing. The Affiliate is responsible for their own taxes, expenses, equipment, advertising and internet costs.'
    ]
  },
  {
    title: '3. Affiliate Account',
    paragraphs: [
      'Approved Affiliates receive an Affiliate Account. Depending on technical availability, it may show a unique referral link and code, referral statistics, qualifying sales, pending, approved, rejected, reversed and paid commissions, payout history and other programme information.',
      'The Affiliate must keep account credentials confidential and must not allow another person to operate the account without ONBAR’s written approval.'
    ]
  },
  {
    title: '4. Referral Tracking',
    paragraphs: [
      'ONBAR will provide one or more unique tracking mechanisms. The system will associate eligible customer activity with an Affiliate according to the programme attribution rules. Dashboard reporting depends on technical availability.',
      'Affiliate ID, referral link and referral code are issued to the Affiliate after approval. ONBAR’s records are the primary source for referral attribution, subject to the dispute process in this Agreement.'
    ]
  },
  {
    title: '5. Commission',
    paragraphs: [
      'Commission is payable only for a qualifying referral that results in a completed and verified sale. The current default commission rate is 5% of attributed completed order value; an approved Affiliate’s actual rate is the rate shown in their Affiliate Account or separately confirmed by ONBAR.',
      'Commission is earned only after the transaction is completed and verified and is no longer subject to cancellation, refund, chargeback, fraud investigation or another reversal.'
    ]
  },
  {
    title: '6. Qualifying Sale',
    paragraphs: [
      'A Qualifying Sale must originate through a valid Affiliate referral mechanism, be completed and verified by ONBAR, be non-fraudulent, not be a prohibited self-referral, remain uncancelled and unreversed, and satisfy the programme rules.',
      'No commission is owed for a transaction that is cancelled, refunded, reversed, fraudulent or otherwise ineligible.'
    ]
  },
  {
    title: '7. Referral Attribution',
    paragraphs: [
      'Proposed attribution model: last valid Affiliate referral. The attribution window is TO BE CONFIRMED and must be finalized in the Affiliate Programme rules before partner activation.',
      'Where a customer interacts with multiple Affiliate links, ONBAR’s recorded attribution system determines credit under the applicable model. System records are primary evidence, subject to the dispute process.'
    ]
  },
  {
    title: '8. Affiliate Dashboard and Transparency',
    paragraphs: [
      'Where technically available, the Affiliate Dashboard will show referral totals and conversions; qualifying sales, transaction status and reversals; pending, approved, rejected, reversed and paid commissions; available balance, payout threshold, payout history, dates and status.',
      'The dashboard is intended to help the Affiliate understand referral performance and how commission balances are calculated.'
    ]
  },
  {
    title: '9. Commission Status',
    paragraphs: [
      'Pending means a potential commission is still within verification. Approved means qualifying conditions have been met and the commission is available under payout rules. Paid means payment was processed.',
      'Reversed means a commission was withdrawn because the underlying transaction became ineligible. Rejected means a referral did not qualify. Where reasonably possible, ONBAR will display the reason for rejection or reversal.'
    ]
  },
  {
    title: '10. Payouts',
    paragraphs: [
      'The current minimum payout request is KSh 1,000. Payout requests are reviewed and paid manually; submission does not guarantee or automatically initiate a transfer. Payout timing and frequency are TO BE CONFIRMED and will be communicated in the Affiliate Account or programme rules.',
      'Approved commissions below the minimum threshold remain in the Affiliate’s balance and may roll over, subject to the final payout rules. For example, an approved balance of KSh 4,500 remains below the KSh 5,000 threshold if that threshold is set for the Affiliate.'
    ]
  },
  {
    title: '11. Payment Records',
    paragraphs: [
      'ONBAR will maintain records of Affiliate commissions and payouts. Commission and payout history will be available through the Affiliate Dashboard where technically available.',
      'Where a payout is processed, ONBAR will provide a payment reference or other reasonable confirmation where available.'
    ]
  },
  {
    title: '12. Commission Disputes',
    paragraphs: [
      'An Affiliate who believes a referral or commission was recorded incorrectly may contact ONBAR through its designated support channel. Include the referral ID, transaction reference where available, relevant date and a description of the issue.',
      'ONBAR will investigate using available records. Where an error is identified, ONBAR will correct the balance or provide an explanation.'
    ]
  },
  {
    title: '13. Prohibited Activities',
    paragraphs: [
      'The Affiliate must not create fraudulent sales or fake customer accounts; use bots or automation to generate artificial referrals; manipulate cookies, tracking or attribution; make false claims, impersonate ONBAR, make unauthorized promises, advertise deceptively, spam customers or market unlawfully.',
      'The Affiliate must not access another Affiliate’s account, interfere with ONBAR systems, exploit vulnerabilities or otherwise manipulate the programme. ONBAR may suspend an account while investigating suspected abuse.'
    ]
  },
  {
    title: '14. Self-Referrals',
    paragraphs: [
      'Unless ONBAR expressly permits otherwise, Affiliates may not earn commission by referring themselves, their own accounts, or transactions primarily created to earn commission. ONBAR may reverse commissions from prohibited self-referrals.'
    ]
  },
  {
    title: '15. Marketing Materials',
    paragraphs: [
      'ONBAR may provide approved images, logos, banners, referral links, descriptions and other marketing materials. The Affiliate may use these only in accordance with ONBAR’s instructions.',
      'The Affiliate must not alter ONBAR branding in a way that could confuse people about the relationship between ONBAR and the Affiliate.'
    ]
  },
  {
    title: '16. Intellectual Property',
    paragraphs: [
      'ONBAR or its licensors retain ownership of their intellectual property, including software, trademarks, logos, designs, graphics, databases, website content, documentation, proprietary systems and analytics.',
      'Participation in the programme does not transfer ownership of ONBAR intellectual property to the Affiliate.'
    ]
  },
  {
    title: '17. Confidentiality',
    paragraphs: [
      'The Affiliate must protect confidential information obtained through the programme, including non-public commission structures, business and customer information, technical and security information, internal analytics, unreleased features and marketing strategies.',
      'Confidential information must not be disclosed to an unauthorized third party.'
    ]
  },
  {
    title: '18. Customer and Personal Data',
    paragraphs: [
      'The Affiliate may collect or process personal information only where legally permitted and supported by an appropriate lawful basis. The Affiliate must not request, sell, publish or misuse customer information for participation in the programme.',
      'ONBAR should provide only information reasonably needed to understand performance, such as referral identifiers, counts, conversion status and commission, rather than unnecessary customer personal information. Both parties must comply with applicable Kenyan data-protection requirements, including purpose limitation, transparency and data minimisation.'
    ]
  },
  {
    title: '19. Compliance with Law',
    paragraphs: [
      'The Affiliate must comply with applicable laws, regulations and programme rules, and must not use the programme for unlawful, deceptive, fraudulent or misleading activity.',
      'Where promoted products or services are subject to advertising, age, licensing or other legal requirements, the Affiliate must comply. ONBAR may impose additional reasonable restrictions for legal or regulatory compliance.'
    ]
  },
  {
    title: '20. Suspension',
    paragraphs: [
      'ONBAR may temporarily suspend an Affiliate Account where it reasonably suspects fraud, abuse, tracking manipulation, security violations, unlawful conduct, a serious breach or material risk to ONBAR or its customers. Where reasonably appropriate, ONBAR will explain the reason.',
      'Suspension does not automatically forfeit legitimately earned commissions. Final treatment of disputed commissions depends on investigation results and applicable law.'
    ]
  },
  {
    title: '21. Termination',
    paragraphs: [
      'Either party may terminate on written notice. The notice period is TO BE CONFIRMED in the final programme rules.',
      'ONBAR may terminate immediately for serious fraud, intentional programme manipulation, a serious confidentiality breach, unlawful access to ONBAR systems, impersonation or serious unlawful conduct. Where a breach can be corrected, ONBAR may allow a reasonable time to remedy it.'
    ]
  },
  {
    title: '22. Commissions After Termination',
    paragraphs: [
      'Termination does not automatically eliminate commissions legitimately earned before termination. Subject to verification, refunds, chargebacks, fraud investigations and programme rules, qualifying pre-termination commissions remain payable through the normal payout process.',
      'After termination, the Affiliate must stop using referral links, promotional materials and ONBAR branding unless ONBAR gives written permission.'
    ]
  },
  {
    title: '23. Limitation of Authority',
    paragraphs: [
      'The Affiliate must not enter contracts or make legal commitments on behalf of ONBAR, promise unapproved refunds or benefits, represent themselves as an ONBAR employee, or materially misrepresent ONBAR products, services or policies.'
    ]
  },
  {
    title: '24. Changes to the Affiliate Programme',
    paragraphs: [
      'ONBAR may reasonably change commission rates, qualifying conditions, attribution rules, payout schedules, minimum thresholds and programme policies. Material changes affecting future commissions will be notified through the Affiliate Dashboard, email or another designated channel.',
      'Unless required by law or necessary to correct fraud or error, a change will not retroactively remove commissions validly earned under prior terms.'
    ]
  },
  {
    title: '25. System Availability',
    paragraphs: [
      'ONBAR will make reasonable efforts to maintain the Affiliate Dashboard and tracking systems. Temporary interruptions may result from maintenance, third-party failures, network problems, security incidents, software updates or events outside ONBAR’s reasonable control.',
      'Temporary unavailability does not automatically create a right to compensation.'
    ]
  },
  {
    title: '26. Taxes',
    paragraphs: [
      'Each party is responsible for applicable tax obligations arising from programme participation. Where ONBAR is legally required to withhold or report taxes on Affiliate payments, it may do so in accordance with applicable law and provide required documentation.'
    ]
  },
  {
    title: '27. Dispute Resolution and Governing Law',
    paragraphs: [
      'The parties will first attempt to resolve disputes through good-faith discussion. They may use an appropriate alternative dispute-resolution process before court proceedings where required or appropriate.',
      'The governing-law and dispute-resolution terms are TO BE CONFIRMED and reviewed by a Kenyan advocate before this draft is adopted as a final commercial agreement.'
    ]
  },
  {
    title: '28. Notices',
    paragraphs: [
      'Official notices may be delivered by email, through the Affiliate Dashboard or by another agreed method. The Affiliate is responsible for keeping contact information up to date.'
    ]
  },
  {
    title: '29. Entire Agreement',
    paragraphs: [
      'This Agreement, together with applicable Affiliate Programme Rules and documents expressly incorporated into it, represents the parties’ understanding of the programme. Amendments must follow the amendment provisions above.'
    ]
  },
  {
    title: '30. Acceptance and Signatures',
    paragraphs: [
      'The application checkbox acknowledges this draft and the current programme rules; it does not replace a final signed agreement. Before commercial activation, the parties must confirm the outstanding details listed above and complete any required final acceptance.'
    ]
  }
];

export const metadata = {
  title: 'Affiliate & Partner Agreement | Online Bar',
  description: 'Draft terms for the Online Bar affiliate and partner programme.',
};

export default function AffiliateAgreementPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-foreground sm:px-8 sm:py-12">
      <article className="mx-auto max-w-4xl space-y-8">
        <Link href="/affiliate/register" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to affiliate application
        </Link>

        <header className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Online Bar · Affiliate Programme</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Affiliate &amp; Partner Agreement</h1>
          <p className="text-sm text-slate-600 sm:text-base">Draft version · Effective date: TO BE CONFIRMED · Agreement version: {AFFILIATE_AGREEMENT_VERSION}</p>
          <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p><strong>Draft, not a final legal agreement.</strong> ONBAR legal entity details, payout timing, attribution window, notice period, governing law and other items marked TO BE CONFIRMED must be completed and reviewed by a Kenyan advocate before partner activation.</p>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-bold text-slate-500">ONBAR legal/business name</dt><dd>TO BE CONFIRMED</dd></div>
            <div><dt className="font-bold text-slate-500">Registration number</dt><dd>TO BE CONFIRMED</dd></div>
            <div><dt className="font-bold text-slate-500">Business address</dt><dd>TO BE CONFIRMED</dd></div>
            <div><dt className="font-bold text-slate-500">Official legal notices email</dt><dd>TO BE CONFIRMED</dd></div>
          </dl>
        </header>

        <section aria-label="Agreement terms" className="space-y-4">
          {sections.map(section => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-lg font-bold sm:text-xl">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600 sm:text-base">
                {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </section>

        <footer className="rounded-2xl bg-slate-900 p-6 text-sm leading-6 text-white">
          <h2 className="font-bold">Programme details currently reflected in the product</h2>
          <p className="mt-2 text-slate-300">Default commission rate: 5% (the Affiliate Account’s approved rate controls). Minimum payout request: KSh 1,000. Payout requests are reviewed manually. These details remain subject to the final written programme rules.</p>
        </footer>
      </article>
    </main>
  );
}
