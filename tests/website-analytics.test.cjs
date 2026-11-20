const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../website-analytics.js'), 'utf8');
const id = 'G-L5D33ZK7NE';
const consentKey = 'xplore:website-analytics:v1';

function activatePage({saved, url = 'https://utpal-mishra.github.io/Xplore/?q=private#route'} = {}) {
  const storage = new Map([[consentKey, saved]]);
  const pageEvents = {};
  const scripts = [];
  const cookies = [];
  const settings = {hidden: true};
  const choice = {checked: false, addEventListener(type, handler) { this[type] = handler; }};
  const window = {addEventListener(type, handler) { pageEvents[type] = handler; }};
  const document = {
    head: {appendChild: script => scripts.push(script)},
    createElement: () => ({}),
    getElementById: id => id === 'websiteAnalytics' ? choice : settings,
    set cookie(value) { cookies.push(value); }
  };
  const localStorage = {
    getItem: key => storage.get(key),
    setItem: (key, value) => storage.set(key, value)
  };

  vm.runInNewContext(source, {window, document, localStorage, location: new URL(url)});
  const commands = () => (window.dataLayer || []).map(args => Array.from(args));
  return {
    choice, settings, scripts, cookies, storage, pageEvents, commands,
    pageViews: () => commands().filter(([command, event]) => command === 'event' && event === 'page_view'),
    setChoice(granted) {
      choice.checked = granted;
      choice.change();
    },
    isDisabled: () => window['ga-disable-' + id]
  };
}

test('production website requires explicit opt-in before loading the tag', () => {
  const app = activatePage();
  assert.equal(app.settings.hidden, false);
  assert.equal(app.choice.checked, false);
  assert.equal(app.isDisabled(), true);
  assert.equal(app.scripts.length, 0);

  app.setChoice(true);
  assert.equal(app.storage.get(consentKey), 'granted');
  assert.equal(app.scripts.length, 1);
  assert.equal(app.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=' + id);
  assert.equal(app.scripts[0].referrerPolicy, 'no-referrer');
  const config = app.commands().find(([command]) => command === 'config')[2];
  assert.equal(config.page_location, 'https://utpal-mishra.github.io/Xplore/');
  assert.equal(config.page_referrer, '');
  assert.equal(config.send_page_view, undefined);
  assert.equal(config.allow_google_signals, false);
  assert.equal(app.pageViews().length, 0);
});

test('withdrawal stops collection across tabs even if a tag is loading', () => {
  const app = activatePage({saved: 'granted'});
  app.storage.set(consentKey, 'denied');
  app.pageEvents.storage({key: consentKey});
  assert.equal(app.isDisabled(), true);
  assert.equal(app.choice.checked, false);
  assert.equal(app.pageViews().length, 0);
  assert.ok(app.cookies.some(cookie => cookie.startsWith('xplore_ga_L5D33ZK7NE=; Max-Age=0; Path=/Xplore/')));

  app.setChoice(true);
  app.setChoice(false);
  app.setChoice(true);
  assert.equal(app.scripts.length, 1);
  assert.equal(app.commands().filter(([command]) => command === 'config').length, 1);
});

test('analytics stays disabled on local and other GitHub Pages sites', () => {
  for (const url of ['http://localhost:8000/Xplore/', 'https://utpal-mishra.github.io/The-Palm/']) {
    const app = activatePage({saved: 'granted', url});
    assert.equal(app.settings.hidden, true);
    assert.equal(app.scripts.length, 0);
  }
});
