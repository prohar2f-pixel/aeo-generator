// seo-app.js — SEO-специфичная логика (общие функции в shared.js)

function generate() {
  const data = collectFormData();

  if (!data.url || !data.name) {
    alert('Заполни минимум URL сайта и Имя / Название');
    return;
  }

  document.getElementById('out-titledesc').textContent = generateTitleDesc(data);
  document.getElementById('out-og').textContent = generateOgTwitter(data);
  document.getElementById('out-localbiz').textContent = generateLocalBusiness(data);
  document.getElementById('out-checklist').textContent = generateSeoChecklist(data);

  document.getElementById('output-section').classList.remove('hidden');
  switchTab('titledesc');
  incrementCounter();
}

function downloadZip() {
  const data = collectFormData();
  const zip = new JSZip();

  zip.file('title-description.html', generateTitleDesc(data));
  zip.file('og-twitter.html', generateOgTwitter(data));
  zip.file('localbusiness.html', generateLocalBusiness(data));
  zip.file('seo-checklist.txt', generateSeoChecklist(data));

  zip.generateAsync({ type: 'blob' }).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'seo-package.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}
