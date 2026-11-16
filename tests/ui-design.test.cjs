const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const css=read('ui-business.css');
const motion=read('ui-workflow.js');

test('business gradient is the final theme in the cascade',()=>{
  assert.match(html,/ui-business\.css\?v=0\.5\.5/);
  assert.ok(html.indexOf('brand-theme.css')<html.indexOf('ui-business.css'));
  assert.ok(html.indexOf('mobile.css')<html.indexOf('ui-business.css'));
  assert.ok(css.includes('linear-gradient(118deg,#0d1b2c 0%,#1b2d42 54%,#19374a 100%)'));
  assert.ok(css.includes('linear-gradient(115deg,#285c80 0%,#2a718e 54%,#317c8a 100%)'));
});

test('motion remains context-only and prioritizes the route form',()=>{
  assert.ok(html.indexOf('id="workflowMotion"')<html.indexOf('class="card route-form"'));
  assert.ok(html.indexOf('class="card route-form"')<html.indexOf('id="decisionMotion"'));
  assert.ok(html.indexOf('id="decisionMotion"')<html.indexOf('<section class="map-wrap">'));
  assert.equal((html.match(/data-workflow-node="/g)||[]).length,4);
  assert.equal((html.match(/data-workflow-step="/g)||[]).length,4);
  for(const stage of ['Data','Workflow','Automation','Reporting'])assert.ok(html.includes('<strong>'+stage+'</strong>'));
  assert.match(html,/aria-label="Explore processing stages"/);
  assert.match(html,/Illustrative flow/);
});

function mock(){
  const events={};
  let seq=0;
  const queue=new Map();
  function element(){
    const callbacks={};
    return {textContent:'',disabled:false,attributes:{},style:{setProperty(){}},
      classList:{toggle(){}},
      addEventListener(k,cb){callbacks[k]=cb},
      fire(k,value){callbacks[k]?.(value)},
      setAttribute(k,v){this.attributes[k]=v},
      getBoundingClientRect(){return {left:0,top:0,width:310,height:180}}
    };
  }
  const packet=element(),progress=element(),button=element(),heading=element(),description=element();
  const steps=Array.from({length:4},element),nodes=Array.from({length:4},element);
  const panel=element();
  panel.querySelector=k=>({
    '[data-workflow-packet]':packet,
    '[data-workflow-progress]':progress,
    '[data-motion-toggle]':button,
    '[data-workflow-caption-title]':heading,
    '[data-workflow-caption-copy]':description
  })[k];
  panel.querySelectorAll=k=>k==='[data-workflow-node]'?nodes:steps;
  const document={visibilityState:'visible',getElementById:()=>panel,addEventListener(k,cb){events[k]=cb}};
  const preference={matches:false,addEventListener(){}};
  const window={matchMedia:q=>q.includes('prefers-reduced')?preference:{matches:false},
    requestAnimationFrame(cb){const id=++seq;queue.set(id,cb);return id},
    cancelAnimationFrame(id){queue.delete(id)},
    addEventListener(){}};
  const navigator={connection:{saveData:false,addEventListener(){}}};
  class IntersectionObserver{constructor(cb){this.callback=cb}observe(){}}
  vm.runInNewContext(motion,{document,window,navigator,IntersectionObserver,console});
  return {document,events,queue,button,steps,heading,description,progress,preference};
}

test('click a workflow stage to inspect, then resume, and pause when tab hides',()=>{
  const {document,events,queue,button,steps,heading,description,progress}=mock();
  assert.equal(steps[0].attributes['aria-pressed'],'true');
  assert.equal(heading.textContent,'Data sources');
  assert.equal(queue.size,1);
  steps[2].fire('click');
  assert.equal(steps[2].attributes['aria-pressed'],'true');
  assert.equal(heading.textContent,'Automation');
  assert.match(description.textContent,/preference-weighted ranking/);
  assert.equal(button.textContent,'Play motion');
  assert.equal(progress.style.transform,'scaleX(0.6667)');
  assert.equal(queue.size,0);
  button.fire('click');
  assert.equal(queue.size,1);
  document.visibilityState='hidden';
  events.visibilitychange();
  assert.equal(queue.size,0);
});

test('respects reduced motion and has no location or network access',()=>{
  const {button,steps,preference}=mock();
  preference.matches=true;
  steps[3].fire('click');
  assert.equal(button.disabled,true);
  assert.equal(button.textContent,'Motion off');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  const runnable=motion.replace(/^\/\*[\s\S]*?\*\//,'');
  for(const forbidden of ['geolocation','fetch(','XMLHttpRequest','localStorage','sendBeacon']){
    assert.ok(!runnable.includes(forbidden),'Unexpected API use: '+forbidden);
  }
});
