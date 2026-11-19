const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const mobile=fs.readFileSync('mobile.css','utf8');
const addressCss=fs.readFileSync('address-search.css','utf8');
const addressJs=fs.readFileSync('address-search.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const loader=fs.readFileSync('eircode-provider.js','utf8');

test('mobile address inputs stay visually consistent with surrounding controls',()=>{
  assert.match(mobile,/\.field input\{[\s\S]*font-family:"Inter"/);
  assert.match(mobile,/\.field input\{[\s\S]*font-size:14px/);
  assert.match(mobile,/\.field input\{[\s\S]*font-weight:500/);
  assert.match(mobile,/\.field input\{[\s\S]*min-height:48px/);
});

test('mobile address labels use the compact app hierarchy',()=>{
  assert.match(mobile,/\.route-form \.field label\{[\s\S]*font-size:9px/);
  assert.match(mobile,/\.route-form \.field label\{[\s\S]*font-weight:700/);
  assert.match(mobile,/\.route-form \.field label\{[\s\S]*margin-bottom:6px/);
});

test('address helper copy stays subordinate to controls',()=>{
  assert.match(addressCss,/\.address-field-status\{[\s\S]*font-family:"Inter"/);
  assert.match(addressCss,/\.address-field-status\{[\s\S]*font-size:8\.5px/);
  assert.match(addressCss,/@media\(max-width:760px\)\{[\s\S]*\.address-field-status\{[\s\S]*font-size:8\.5px/);
});

test('placeholder matches the app control scale',()=>{
  assert.match(mobile,/\.field input::placeholder\{[\s\S]*font-size:14px/);
  assert.match(mobile,/\.field input::placeholder\{[\s\S]*font-family:"Inter"/);
});

test('balanced typography assets are cache-busted consistently',()=>{
  assert.match(index,/mobile\.css\?v=1\.0\.2/);
  assert.match(loader,/address-search\.js\?v=1\.0\.2/);
  assert.match(addressJs,/address-search\.css\?v=1\.0\.2/);
});
