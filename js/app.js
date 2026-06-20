const WORKER_URL = 'https://aeo-analyzer.prohar2f.workers.dev';

async function analyzeUrl() {
  const url = document.getElementById('url').value.trim();
  if (!url || !url.startsWith('http')) {
    alert('Введи корректный URL сайта (начинается с https://)');
    return;
  }

  const btn = document.getElementById('analyzeBtn');
  const status = document.getElementById('analyze-status');

  btn.disabled = true;
  status.className = 'hint loading';
  status.textContent = '⏳ Анализирую сайт...';

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const json = await res.json();

    if (!json.ok || !json.data) {
      throw new Error((json.error || 'unknown_error') + (json.detail ? ': ' + json.detail : ''));
    }

    const d = json.data;
    const setVal = (id, val) => { if (val) document.getElementById(id).value = val; };

    setVal('name', d.name);
    setVal('jobTitle', d.jobTitle);
    setVal('phone', d.phone);
    setVal('email', d.email);
    setVal('telegram', d.telegram);
    setVal('city', d.city);

    if (d.services && d.services.length > 0) {
      document.getElementById('services').value = d.services
        .map(s => `${s.name} | ${s.price} | `)
        .join('\n');
    }

    if (d.faq && d.faq.length > 0) {
      document.getElementById('faq').value = d.faq
        .map(f => `${f.q} | ${f.a}`)
        .join('\n');
    }

    status.className = 'hint success';
    status.textContent = '✓ Форма заполнена автоматически — проверь и исправь если нужно';
  } catch (err) {
    status.className = 'hint error';
    status.textContent = '✗ Ошибка: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

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
