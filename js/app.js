function collectFormData() {
  const getVal = id => document.getElementById(id).value.trim();

  const servicesRaw = getVal('services');
  const services = servicesRaw
    ? servicesRaw.split('\n').filter(Boolean).map(line => {
        const parts = line.split('|').map(s => s.trim());
        return { name: parts[0] || '', price: parts[1] || '0', currency: 'RUB', duration: parts[2] || '' };
      })
    : [];

  const faqRaw = getVal('faq');
  const faq = faqRaw
    ? faqRaw.split('\n').filter(Boolean).map(line => {
        const idx = line.indexOf('|');
        if (idx === -1) return { q: line, a: '' };
        return { q: line.slice(0, idx).trim(), a: line.slice(idx + 1).trim() };
      })
    : [];

  return {
    url: getVal('url').replace(/\/$/, ''),
    name: getVal('name'),
    jobTitle: getVal('jobTitle'),
    phone: getVal('phone'),
    email: getVal('email'),
    telegram: getVal('telegram'),
    city: getVal('city'),
    lang: getVal('lang') || 'ru',
    services,
    faq
  };
}

function generate() {
  const data = collectFormData();

  if (!data.url || !data.name) {
    alert('Заполни минимум URL сайта и Имя / Название');
    return;
  }

  document.getElementById('out-robots').textContent = generateRobots(data);
  document.getElementById('out-sitemap').textContent = generateSitemap(data);
  document.getElementById('out-meta').textContent = generateMetaTags(data);
  document.getElementById('out-jsonld').textContent = generateJsonLd(data);
  document.getElementById('out-faq').textContent = generateFaqHtml(data);

  document.getElementById('output-section').classList.remove('hidden');
  switchTab('robots');
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.panel !== name);
  });
}

function copyTab() {
  const activePanel = document.querySelector('.tab-panel:not(.hidden)');
  if (!activePanel) return;
  navigator.clipboard.writeText(activePanel.querySelector('pre').textContent)
    .then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'Скопировано!';
      setTimeout(() => { btn.textContent = 'Копировать'; }, 2000);
    });
}

function downloadZip() {
  const data = collectFormData();
  const zip = new JSZip();

  zip.file('robots.txt', generateRobots(data));
  zip.file('sitemap.xml', generateSitemap(data));
  zip.file('meta-tags.html', generateMetaTags(data));
  zip.file('jsonld.html', generateJsonLd(data));
  const faqHtml = generateFaqHtml(data);
  if (faqHtml) zip.file('faq.html', faqHtml);

  zip.generateAsync({ type: 'blob' }).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aeo-package.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}
