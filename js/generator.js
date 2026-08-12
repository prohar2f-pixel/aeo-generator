// AEO File Generator Functions
// Pure functions for generating AI-search optimized files
// No DOM access, no imports, plain JavaScript

function generateRobots(data) {
  const sitemapUrl = data.url.replace(/\/$/, '') + '/sitemap.xml';
  const searchDirective = data.allowAiSearch === false ? 'Disallow: /' : 'Allow: /';
  const trainingDirective = data.allowAiTraining === true ? 'Allow: /' : 'Disallow: /';
  return `User-agent: *
Allow: /

User-agent: OAI-SearchBot
${searchDirective}

User-agent: GPTBot
${trainingDirective}

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
${searchDirective}

User-agent: ClaudeBot
${searchDirective}

User-agent: anthropic-ai
${trainingDirective}

User-agent: YouBot
${searchDirective}

User-agent: YandexAdditionalBot
${searchDirective}

User-agent: Applebot-Extended
${trainingDirective}

Sitemap: ${sitemapUrl}`;
}

function generateSitemap(data) {
  const root = new URL(data.url);
  const origin = root.origin;
  const today = new Date().toISOString().split('T')[0];
  const candidates = ['/', ...(Array.isArray(data.pages) ? data.pages : [])];
  const urls = [];
  const seen = new Set();

  candidates.forEach(candidate => {
    try {
      const page = new URL(candidate, origin + '/');
      if (!['http:', 'https:'].includes(page.protocol) || page.origin !== origin) return;
      page.hash = '';
      if (seen.has(page.href)) return;
      seen.add(page.href);
      urls.push(page.href);
    } catch { /* пропускаем некорректные URL */ }
  });

  const entries = urls.map(url => `  <url>
    <loc>${url.replace(/&/g, '&amp;')}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
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
    "name": data.name + (data.jobTitle ? " - " + data.jobTitle : ""),
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
