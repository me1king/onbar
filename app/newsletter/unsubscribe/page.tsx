import UnsubscribeForm from './UnsubscribeForm';

export default async function NewsletterUnsubscribePage({
    searchParams
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;
    return <UnsubscribeForm token={token || ''} />;
}
