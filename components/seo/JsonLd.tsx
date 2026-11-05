const baseUrl = 'https://www.onlinebar.co.ke';
const storeName = 'Online Bar';
const contactPhone = '+254769345599';

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export default function JsonLd() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${baseUrl}/#org`,
    "name": storeName,
    "description": "Online Bar is an online store for drinks, snacks, and gifts. Customers can check current product availability and delivery options on the website.",
    "url": baseUrl,
    "logo": `${baseUrl}/favicon.svg`,
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": contactPhone,
      "contactType": "customer service",
      "areaServed": "KE",
      "availableLanguage": "English"
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }}
    />
  );
}
