// seo-generator.js — чистые функции генерации SEO-файлов. Без DOM.

function buildTitle(data) {
  let t = data.name || 'Сайт';
  if (data.jobTitle) t += ' — ' + data.jobTitle;
  if (data.city) t += ' в ' + data.city;
  t += ' | Цены и запись';
  return t.length > 60 ? t.slice(0, 57).trimEnd() + '...' : t;
}

function buildDescription(data) {
  const parts = [];
  if (data.jobTitle) parts.push(data.jobTitle);
  if (data.name) parts.push(data.name);
  if (data.city) parts.push('в городе ' + data.city);
  let d = parts.join(' ');
  if (data.services && data.services.length > 0) {
    d += '. ' + data.services.map(s => s.name).filter(Boolean).join(', ');
  }
  if (data.phone) d += '. Запись по телефону ' + data.phone;
  d = d.trim();
  return d.length > 160 ? d.slice(0, 157).trimEnd() + '...' : d;
}

function generateTitleDesc(data) {
  return `<title>${buildTitle(data)}</title>\n<meta name="description" content="${buildDescription(data)}">`;
}

function generateOgTwitter(data) {
  const url = (data.url || '').replace(/\/$/, '');
  const title = buildTitle(data);
  const desc = buildDescription(data);
  const img = url + '/og-image.jpg';
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${url}/">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:locale" content="${(data.lang || 'ru') === 'ru' ? 'ru_RU' : 'en_US'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${desc}">`,
    `<meta name="twitter:image" content="${img}">`,
  ].join('\n');
}

function generateLocalBusiness(data) {
  const url = (data.url || '').replace(/\/$/, '');
  const tgHandle = data.telegram
    ? (data.telegram.startsWith('@') ? data.telegram : '@' + data.telegram)
    : '';
  const tgUrl = tgHandle ? `https://t.me/${tgHandle.replace('@', '')}` : '';

  const biz = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": data.name,
    "url": url + "/"
  };
  if (data.phone) biz.telephone = data.phone;
  if (data.email) biz.email = data.email;
  if (data.city) {
    biz.address = { "@type": "PostalAddress", "addressLocality": data.city, "addressCountry": "RU" };
    biz.areaServed = data.city;
  }
  if (data.services && data.services.length > 0) {
    const prices = data.services.map(s => parseInt(s.price, 10)).filter(n => n > 0);
    if (prices.length > 0) {
      const min = Math.min(...prices), max = Math.max(...prices);
      biz.priceRange = min === max ? `${min} ₽` : `${min}–${max} ₽`;
    }
  }
  if (tgUrl) biz.sameAs = [tgUrl];

  return `<script type="application/ld+json">\n${JSON.stringify(biz, null, 2)}\n</script>`;
}

function generateSeoChecklist(data) {
  const site = (data.url || 'твой сайт').replace(/\/$/, '');
  return `SEO-ЧЕКЛИСТ для ${site}
========================================

УЖЕ ГОТОВО (вставь файлы из пакета в <head> страницы):
[x] Title и meta description — из файла title-description.html
[x] Open Graph и Twitter Card — из файла og-twitter.html
[x] LocalBusiness разметка — из файла localbusiness.html

ОСТАЛОСЬ СДЕЛАТЬ РУКАМИ:
[ ] Один <h1> на странице с главным ключевым словом
[ ] Тег alt у всех картинок (описание словами, что на фото)
[ ] Картинка для соцсетей og-image.jpg размером 1200x630 px в корне сайта
[ ] Добавить в LocalBusiness точный адрес и часы работы
[ ] Сжать картинки и проверить скорость на PageSpeed Insights (pagespeed.web.dev)
[ ] Поставить внутренние ссылки между страницами сайта
[ ] Зарегистрировать сайт в Яндекс.Вебмастер (webmaster.yandex.ru)
[ ] Зарегистрировать сайт в Google Search Console (search.google.com/search-console)
`;
}
