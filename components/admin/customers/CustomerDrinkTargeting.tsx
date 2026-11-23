import { Megaphone, ShieldCheck, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';

type CustomerDrinkTargetingProps = {
  preferences: Array<{ category_id: string; affinity_score: number }>;
  topItems: Array<{ name: string; quantity: number }>;
  consent: {
    marketing: boolean;
    in_app_marketing: boolean;
    personalization: boolean;
  } | null;
  ageVerificationStatus: string;
};

export default function CustomerDrinkTargeting({
  preferences,
  topItems,
  consent,
  ageVerificationStatus
}: CustomerDrinkTargetingProps) {
  const canPersonalize = consent?.personalization === true;
  const canMarketInApp = consent?.marketing === true && consent.in_app_marketing === true;
  const eligibleForPersonalizedCampaign = canPersonalize && canMarketInApp;
  const topPreference = canPersonalize
    ? [...preferences]
      .filter(preference => preference.category_id.trim())
      .sort((left, right) => right.affinity_score - left.affinity_score)[0]
    : null;
  const topPurchasedItem = canPersonalize ? topItems[0] : null;
  const blockers = [
    !consent && 'No marketing consent record',
    consent && !consent.marketing && 'Marketing consent is off',
    consent?.marketing && !consent.in_app_marketing && 'In-app marketing is not enabled',
    !canPersonalize && 'Personalization is not enabled'
  ].filter((reason): reason is string => Boolean(reason));

  return (
    <Card className="space-y-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">Drink of the Day · customer fit</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use the saved preference signals below to choose a relevant drink category. This panel does not send a campaign.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
            <Sparkles className="h-4 w-4 text-amber-600" />
            Best category match
          </h3>
          {!canPersonalize ? (
            <p className="mt-2 text-sm text-slate-600">Personalization is off; don’t use preference data to personalize this promotion.</p>
          ) : topPreference ? (
            <>
              <p className="mt-2 text-lg font-black text-slate-900">{topPreference.category_id}</p>
              <p className="text-xs text-slate-500">Saved category preference · {Math.max(0, Math.min(100, topPreference.affinity_score))}% affinity</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No category preference is recorded yet.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">Most purchased drink</h3>
          {topPurchasedItem ? (
            <>
              <p className="mt-2 text-lg font-black text-slate-900">{topPurchasedItem.name}</p>
              <p className="text-xs text-slate-500">Recorded quantity: {topPurchasedItem.quantity}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              {canPersonalize ? 'No completed drink purchases are recorded.' : 'Hidden because personalization is off.'}
            </p>
          )}
        </section>
      </div>

      <section className={`rounded-xl border p-4 ${eligibleForPersonalizedCampaign ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <ShieldCheck className="h-4 w-4" />
          {eligibleForPersonalizedCampaign ? 'Personalized in-app campaign consent is on' : 'Do not target with personalized in-app promotions'}
        </h3>
        {blockers.length > 0 && <p className="mt-1 text-xs text-slate-700">{blockers.join(' · ')}</p>}
        <p className="mt-2 text-xs text-slate-700">
          Delivery ID-check status: {ageVerificationStatus}. Confirm applicable age eligibility before using an age-restricted or alcoholic product in an ad.
        </p>
      </section>

      <p className="text-[11px] leading-5 text-slate-500">
        Preferences and purchase history are signals, not guarantees. Only use them for personalization when consent is enabled; respect the customer’s current opt-out.
      </p>
    </Card>
  );
}
