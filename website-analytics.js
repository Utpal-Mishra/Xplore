(function () {
  'use strict';

  const site = 'https://utpal-mishra.github.io';
  const sitePath = '/Xplore/';
  if (location.origin !== site || ![sitePath, sitePath + 'index.html'].includes(location.pathname)) return;

  const measurementId = 'G-L5D33ZK7NE';
  const consentKey = 'xplore:website-analytics:v1';
  const disabledFlag = 'ga-disable-' + measurementId;
  const settings = document.getElementById('websiteAnalyticsSettings');
  const choice = document.getElementById('websiteAnalytics');
  let tag;

  function readConsent() {
    try {
      return localStorage.getItem(consentKey) === 'granted';
    } catch {
      return false;
    }
  }

  function loadTag() {
    if (tag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      page_location: site + sitePath,
      page_referrer: '',
      page_title: 'XPLORE — Ireland',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: 'none',
      cookie_path: sitePath,
      cookie_prefix: 'xplore',
      cookie_expires: 90 * 24 * 60 * 60,
      cookie_update: false
    });

    tag = document.createElement('script');
    tag.async = true;
    tag.referrerPolicy = 'no-referrer';
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(tag);
  }

  function applyConsent(granted) {
    window[disabledFlag] = !granted;
    choice.checked = granted;
    if (granted) {
      loadTag();
    } else if (tag) {
      for (const name of ['xplore_ga', 'xplore_ga_' + measurementId.slice(2)]) {
        document.cookie = name + '=; Max-Age=0; Path=' + sitePath + '; Secure; SameSite=Lax';
      }
    }
  }

  settings.hidden = false;
  applyConsent(readConsent());
  choice.addEventListener('change', () => {
    const granted = choice.checked;
    try {
      localStorage.setItem(consentKey, granted ? 'granted' : 'denied');
    } catch {
      // The choice still applies to this page if browser storage is unavailable.
    }
    applyConsent(granted);
  });
  window.addEventListener('storage', event => {
    if (event.key === consentKey || event.key === null) applyConsent(readConsent());
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) applyConsent(readConsent());
  });
})();
