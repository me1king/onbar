const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://onlinebar.onrender.com';
const storeName = 'Online Bar';
const contactPhone = '+254769345599';

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export default function JsonLd() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Apex Market",
    "description": "Apex Market is the customer-facing storefront. Its digital experience is built by Online Bar in collaboration with the Apex Market team.",
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

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": storeName,
    "description": "Online Bar builds the Apex Market digital storefront in collaboration with the Apex Market team.",
    "brand": {
      "@type": "Brand",
      "name": "Apex Market"
    },
    "image": `${baseUrl}/favicon.svg`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Nairobi",
      "addressRegion": "Nairobi County",
      "addressCountry": "KE"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": -1.286389,
      "longitude": 36.817223
    },
    "url": baseUrl,
    "telephone": contactPhone,
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "opens": "09:00",
        "closes": "18:00"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": "Saturday",
        "opens": "10:00",
        "closes": "16:00"
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(localBusinessSchema) }}
      />
    </>
  );
}
