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
    "description": "Online Bar is an online store for drinks, snacks, and gifts. Online ordering and customer care are available 24/7; customer care replies within 15 minutes. Customers can check current product availability and delivery options on the website.",
    "url": baseUrl,
    "logo": `${baseUrl}/favicon.svg`,
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": contactPhone,
      "contactType": "customer service",
      "url": `${baseUrl}/contact`,
      "description": "Customer care is online 24/7 and replies within 15 minutes.",
      "areaServed": "KE",
      "availableLanguage": "English",
      "hoursAvailable": {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
          .map(day => `https://schema.org/${day}`),
        "opens": "00:00",
        "closes": "23:59"
      }
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }}
    />
  );
}
