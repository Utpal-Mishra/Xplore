const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const mobile=fs.readFileSync('mobile.css','utf8');
const addressCss=fs.readFileSync('address-search.css','utf8');
const addressJs=fs.readFileSync('address-search.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const loader=fs.readFileSync('eircode-provider.js','utf8');

test('mobile address inputs use readable consumer-navigation typography',()=>{
  assert.match(mobile,/\.field input\{[\s\S]*font-family:"Inter"/);
  assert.match(mobile,/\.field input\{[\s\S]*font-size:16px/);
  assert.match(mobile,/\.field input\{[\s\S]*font-weight:500/);
});

test('mobile address labels retain compact hierarchy without tiny dashboard text',()=>{
  assert.match(mobile,/\.route-form \.field label\{[\s\S]*font-size:10\.5px/);
  assert.match(mobile,/\.route-form \.field label\{[\s\S]*font-weight:700/);
  assert.match(mobile,/\.route-form \.field label\{[\s\S]*margin-bottom:8px/);
});

test('address helper copy is at least 10px and uses Inter body font',()=>{
  assert.match(addressCss,/\.address-field-status\{[\s\S]*font-family:"Inter"/);
  assert.match(addressCss,/\.address-field-status\{[\s\S]*font-size:10px/);
  assert.match(addressCss,/@media\(max-width:760px\)\{[\s\S]*\.address-field-status\{[\s\S]*font-size:10\.5px/);
});

test('placeholder remains 16px to avoid iOS input zoom and uses body font',()=>{
  assert.match(mobile,/\.field input::placeholder\{[\s\S]*font-size:16px/);
  assert.match(mobile,/\.field input::placeholder\{[\s\S]*font-family:"Inter"/);
});

test('typography assets are cache-busted consistently',()=>{
  assert.match(index,/mobile\.css\?v=1\.0\.1/);
  assert.match(loader,/address-search\.js\?v=1\.0\.1/);
  assert.match(addressJs,/address-search\.css\?v=1\.0\.1/);
});
