const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const html=read('index.html');
const base=read('styles.css');
const explanation=read('decision-insight.js');
const explanationCss=read('decision-insight.css');

test('XPLORE keeps its established green theme',()=>{
  assert.ok(html.includes('<link rel="stylesheet" href="styles.css">'));
  assert.ok(base.includes('--bg:#07110d'));
  assert.ok(base.includes('--green:#52d98d'));
  assert.ok(!html.includes('href="ui-business.css'));
  assert.ok(!html.includes('href="brand-theme.css'));
  assert.ok(!html.includes('href="motion-green.css'));
  assert.ok(html.includes('decision-insight.css'));
  assert.ok(explanationCss.includes('background:linear-gradient(153deg,#122c1e'));
});

test('decorative Data to Decisions UI is removed from the main interface',()=>{
  assert.ok(!html.includes('id="workflowMotion"'));
  assert.ok(!html.includes('data-workflow-step'));
  assert.ok(!html.includes('data-workflow-packet'));
  assert.ok(!html.includes('data-motion-toggle'));
  assert.ok(!html.includes('ui-workflow.js'));
  assert.ok(!html.includes('brand-motion.js'));
});

test('route search immediately follows hero and Decision Intelligence remains route-specific',()=>{
  const hero=html.indexOf('class="sub"');
  const form=html.indexOf('class="card route-form"');
  const insight=html.indexOf('id="decisionInsight"');
  const map=html.indexOf('<section class="map-wrap">');
  assert.ok(hero>=0&&hero<form);
  assert.ok(form<insight&&insight<map);
  assert.ok(html.includes('id="from"')&&html.includes('id="to"'));
  assert.ok(html.includes('id="decisionInsightScore"'));
  assert.ok(html.includes('id="decisionInsightTime"'));
  assert.ok(html.includes('id="decisionInsightCarbon"'));
  assert.ok(html.includes('id="decisionInsightDriverDetail"'));
  assert.ok(html.includes('id="decisionInsightEmpty"'));
});

test('decision panel still loads its actual route explanation logic',()=>{
  assert.ok(html.includes('decision-insight.js?v=20261119'));
  assert.ok(html.indexOf('decision-insight.js')>html.indexOf('app.js'));
  assert.ok(explanation.includes('buildRouteDecisionInsight'));
  assert.ok(explanation.includes('resetRouteDecisionInsight'));
  assert.ok(!explanation.includes('fetch('));
  assert.ok(!explanation.includes('geolocation'));
  assert.ok(explanationCss.includes('prefers-reduced-motion:reduce'));
});
