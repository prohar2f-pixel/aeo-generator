// AEO File Generator Functions
// Pure functions for generating AI-search optimized files
// No DOM access, no imports, plain JavaScript

function generateRobots(data) {
  const sitemapUrl = data.url.replace(/\/$/, '') + '/sitemap.xml';
  return `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: YouBot
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: ${sitemapUrl}`;
}

function generateSitemap(data) {
  const url = data.url.replace(/\/$/, '');
  const today = new Date().toISOString().split('T')[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
}

function generateMetaTags(data) {
  const tgHandle = data.telegram
    ? (data.telegram.startsWith('@') ? data.telegram : '@' + data.telegram)
    : '';
  const tgUrl = tgHandle ? `https://t.me/${tgHandle.replace('@', '')}` : '';

  const lines = [
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">`,
    `<meta name="author" content="${data.name}">`,
  ];
  if (tgUrl) lines.push(`<link rel="me" href="${tgUrl}">`);
  return lines.join('\n');
}

function generateJsonLd(data) {
  const url = data.url.replace(/\/$/, '');
  const tgHandle = data.telegram
    ? (data.telegram.startsWith('@') ? data.telegram : '@' + data.telegram)
    : '';
  const tgUrl = tgHandle ? `https://t.me/${tgHandle.replace('@', '')}` : '';

  const person = {
    "@type": "Person",
    "@id": url + "/#person",
    "name": data.name,
    "url": url + "/",
    "knowsLanguage": data.lang || "ru"
  };
  if (data.jobTitle) person.jobTitle = data.jobTitle;
  if (data.phone) person.telephone = data.phone;
  if (data.email) person.email = data.email;
  if (tgUrl) person.sameAs = [tgUrl];
  if (data.city) person.areaServed = data.city;

  if (data.services && data.services.length > 0) {
    person.offers = data.services.map(s => ({
      "@type": "Offer",
      "name": s.name,
      "price": s.price,
      "priceCurrency": s.currency || "RUB"
    }));
  }

  const webpage = {
    "@type": "WebPage",
    "@id": url + "/#webpage",
    "url": url + "/",
    "name": data.name + (data.jobTitle ? " — " + data.jobTitle : ""),
    "inLanguage": data.lang || "ru",
    "about": { "@id": url + "/#person" }
  };

  const graph = [person, webpage];

  if (data.services && data.services.length > 0) {
    data.services.forEach((s, i) => {
      graph.push({
        "@type": "Service",
        "@id": url + "/#service-" + i,
        "name": s.name,
        "provider": { "@id": url + "/#person" },
        "areaServed": data.city || "RU",
        "offers": {
          "@type": "Offer",
          "price": s.price,
          "priceCurrency": s.currency || "RUB",
          "availability": "https://schema.org/InStock"
        }
      });
    });
  }

  if (data.faq && data.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "mainEntity": data.faq.map(item => ({
        "@type": "Question",
        "name": item.q,
        "acceptedAnswer": { "@type": "Answer", "text": item.a }
      }))
    });
  }

  const schema = { "@context": "https://schema.org", "@graph": graph };
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

function generateFaqHtml(data) {
  if (!data.faq || data.faq.length === 0) return '';
  const items = data.faq.map(item =>
    `  <details>\n    <summary>${item.q}</summary>\n    <p>${item.a}</p>\n  </details>`
  ).join('\n');
  return `<section id="faq">\n  <h2>Часто задаваемые вопросы</h2>\n${items}\n</section>`;
}
