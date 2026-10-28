/** Structured data for the home page: the organisation and the web app. Static, so safe to inline. */
export function JsonLd() {
  const base = process.env.APP_URL || 'https://worklabxc.com';
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'WorkLab XC',
      url: base,
      email: 'support@worklabxc.com',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'WorkLab XC',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url: base,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    },
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
