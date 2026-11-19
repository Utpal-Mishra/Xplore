const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");
const html=read("index.html");
const css=read("motion-green.css");
const base=read("styles.css");
const js=read("ui-workflow.js");

test("original green visual system is active and business theme is isolated",()=>{
  assert.ok(html.includes("motion-green.css?v=20261119"));
  assert.ok(html.indexOf("motion-green.css")>html.indexOf("desktop-polish.css"));
  assert.ok(html.indexOf("motion-green.css")>html.indexOf("mobile.css"));
  assert.ok(!html.includes('href="ui-business.css'));
  assert.ok(!html.includes('href="brand-theme.css'));
  assert.ok(base.includes("--bg:#07110d"));
  assert.ok(base.includes("--green:#52d98d"));
  assert.ok(css.includes("linear-gradient"));
  assert.ok(css.includes("#5fd88f") || html.includes("#5fd88f"));
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
