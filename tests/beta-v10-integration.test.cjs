const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const beta=read('beta-v10.js');
const learning=read('learning-v06.js');
const loader=read('eircode-provider.js');
const workflow=read('.github/workflows/beta-monitor.yml');
const issue=read('.github/ISSUE_TEMPLATE/beta-bug.yml');
const gates=read('.github/workflows/quality-gates.yml');

test('local analytics opt-out stops passive tracking before storage/send',()=>{
  const track=learning.slice(learning.indexOf('function track('),learning.indexOf('function providerForSelection'));
  assert.ok(track.includes("if(!localAnalyticsEnabled())return record"));
  assert.ok(track.indexOf("if(!localAnalyticsEnabled())return record")<track.indexOf("readList(EVENT_KEY)"));
  assert.ok(learning.includes('setLocalAnalyticsEnabled'));
  assert.ok(learning.includes('globalThis.XploreLearning'));
});

test('Founding Tester UI does not request name or email',()=>{
  assert.ok(beta.includes("TESTER_KEY='xplore:v10:founding-tester'"));
  assert.ok(beta.includes('Tester ID'));
  assert.ok(!beta.includes('type="email"'));
  assert.ok(!beta.includes('Tester name'));
  assert.ok(beta.includes('does not register your name or email'));
});

test('Beta modules load only after learning privacy API exists',()=>{
  const learn=loader.indexOf("learning-v06.js");
  const core=loader.indexOf("beta-core-v10.js?v=1.0.0");
  const betaUi=loader.indexOf("beta-v10.js?v=1.0.0");
  assert.ok(learn>=0&&learn<core&&core<betaUi);
  assert.ok(loader.includes('Ireland v1.0.0 Beta'));
});

test('production monitor is hourly and post-deployment without user data inputs',()=>{
  assert.ok(workflow.includes("cron: '17 * * * *'"));
  assert.ok(workflow.includes("workflows: ['Deploy XPLORE to GitHub Pages']"));
  const monitor=read('scripts/beta_monitor.py');
  assert.ok(monitor.includes('Public app/system data only; no user/tester/location data accessed.'));
  assert.ok(!monitor.includes('geolocation'));
});

test('public Beta issue form requires privacy acknowledgement',()=>{
  assert.ok(issue.includes('public GitHub issue'));
  assert.ok(issue.includes('exact GPS coordinates'));
  assert.ok(issue.includes('required: true'));
});

test('v1 release gate is mandatory in CI',()=>{
  assert.ok(gates.includes('scripts/release_gate.py'));
});
