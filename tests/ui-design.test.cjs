const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");
const html=read("index.html");
const css=read("ui-business.css");
const js=read("ui-workflow.js");

test("enterprise visual system loads after existing layout styles",()=>{
  assert.ok(html.includes("ui-business.css?v=0.5.4"));
  assert.ok(html.indexOf("ui-business.css")>html.indexOf("desktop-polish.css"));
  assert.ok(html.indexOf("ui-business.css")>html.indexOf("mobile.css"));
  assert.ok(css.includes("--bg:#0b1422"));
  assert.ok(css.includes("linear-gradient"));
});

test("data-to-decision animation remains separate from navigation map",()=>{
  assert.ok(html.indexOf('id="workflowMotion"')>html.indexOf('class="sub"'));
  assert.ok(html.indexOf('id="workflowMotion"')<html.indexOf('class="card route-form"'));
  assert.ok(html.indexOf('id="workflowMotion"')<html.indexOf('<section class="map-wrap">'));
  assert.equal((html.match(/data-workflow-node="/g)||[]).length,4);
  assert.equal((html.match(/data-workflow-step="/g)||[]).length,4);
  for(const step of ["Data","Workflow","Automation","Reporting"])assert.ok(html.includes("<strong>"+step+"</strong>"));
  assert.ok(html.includes("Illustrative flow"));
});

test("animation is paused when hidden or outside viewport, and supports reduced motion",()=>{
  assert.ok(html.indexOf("ui-workflow.js")>html.indexOf("app.js"));
  assert.ok(js.includes('document.visibilityState!=="hidden"'));
  assert.ok(js.includes("IntersectionObserver"));
  assert.ok(js.includes("requestAnimationFrame"));
  assert.ok(js.includes("cancelAnimationFrame"));
  assert.ok(js.includes("prefers-reduced-motion: reduce"));
  assert.ok(js.includes('toggle.addEventListener("click"'));
  assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
});

test("motion is illustrative and does not access location or network",()=>{
  const runnable=js.replace(/^\/\*[\s\S]*?\*\//,"");
  for(const api of ["geolocation","fetch(","XMLHttpRequest","localStorage","sendBeacon"]){
    assert.ok(!runnable.includes(api),"Unexpected use of "+api);
  }
});
