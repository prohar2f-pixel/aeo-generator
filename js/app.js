// app.js — AEO-специфичная логика (общие функции в shared.js)

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
  incrementCounter();
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
