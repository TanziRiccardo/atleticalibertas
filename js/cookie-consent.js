(function () {
  const KEY = 'cookieConsent'; // 'accepted' | 'declined'
  const banner = document.getElementById('cookie-banner');
  const btnAcc = document.getElementById('cookie-accept');
  const btnDec = document.getElementById('cookie-decline');

  function showBannerIfNeeded() {
    if (!localStorage.getItem(KEY) && banner) banner.style.display = 'block';
  }

  function hideBanner() {
    if (banner) banner.style.display = 'none';
  }

  function setConsent(val) {
    localStorage.setItem(KEY, val);
    hideBanner();
    if (val === 'accepted') enableOptionalStuff();
    else disableOptionalStuff();
  }

  // --------- Gate per contenuti terze parti (Maps, YouTube, ecc.) ----------
  // Come usarlo:
  // 1) al posto dell’<iframe> metti:
  //    <div class="cc-embed" data-src="IFRAME_SRC" data-title="Mappa impianto"></div>
  // 2) lo script qui sotto lo renderà un placeholder con bottone "Abilita"
  // 3) se l’utente accetta i cookie, li attiva automaticamente (o con click)
  function renderPlaceholders() {
    document.querySelectorAll('.cc-embed').forEach(el => {
      // se c'è già un figlio (già attivato), non toccare
      if (el.dataset.ready === '1' || el.querySelector('[data-live-embed]')) return;

      const title = el.dataset.title || 'Contenuto esterno';
      el.innerHTML = `
        <div class="p-3 rounded-3 bg-dark border border-secondary text-center">
          <p class="mb-3 text-white-50">${title} — richiede cookie di terze parti.</p>
          <div class="d-flex justify-content-center gap-2">
            <button type="button" class="btn btn-primary btn-sm cc-activate">Abilita</button>
            <a href="cookie-policy.html" class="btn btn-outline-light btn-sm border-2">Info privacy</a>
          </div>
        </div>
      `;
      el.dataset.ready = '1';
      const btn = el.querySelector('.cc-activate');
      btn && btn.addEventListener('click', () => activateEmbed(el));
    });
  }

  function activateEmbed(wrapper) {
    const src = wrapper.dataset.src;
    if (!src) return;
    // iframe “live”
    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-live-embed', '1');
    iframe.src = src;
    iframe.width = '100%';
    iframe.height = wrapper.dataset.height || '420';
    iframe.style.border = '0';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    wrapper.innerHTML = '';
    wrapper.appendChild(iframe);
  }

  function enableOptionalStuff() {
    // Attiva automaticamente i contenuti esterni
    document.querySelectorAll('.cc-embed').forEach(activateEmbed);

    // (Facoltativo) qui potresti caricare analytics, etc.
    // es:
    // loadScript('https://www.googletagmanager.com/gtag/js?id=G-XXXXXX', { async: true });
    // window.dataLayer = window.dataLayer || [];
    // function gtag(){dataLayer.push(arguments);}
    // gtag('js', new Date());
    // gtag('config', 'G-XXXXXX');
  }

  function disableOptionalStuff() {
    // Non carichiamo nulla. Rendi/lascia i placeholder.
    renderPlaceholders();
  }

  function loadScript(src, attrs = {}) {
    const s = document.createElement('script');
    s.src = src;
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    document.head.appendChild(s);
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    const val = localStorage.getItem(KEY);
    if (!val) {
      showBannerIfNeeded();
      renderPlaceholders();
    } else if (val === 'accepted') {
      enableOptionalStuff();
    } else {
      disableOptionalStuff();
    }
  });

  btnAcc && btnAcc.addEventListener('click', () => setConsent('accepted'));
  btnDec && btnDec.addEventListener('click', () => setConsent('declined'));

  // Rendi accessibile una funzione per resettare da console o da link
  window.__resetCookieConsent = function () {
    localStorage.removeItem(KEY);
    showBannerIfNeeded();
    renderPlaceholders();
  };
})();
