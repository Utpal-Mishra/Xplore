/* XPLORE UIUX 0.5.5
   Conceptual journey data -> workflow -> automation -> reporting.
   Deliberately separate from routing, geolocation, data adapters and reporting APIs. */
(()=>{
  "use strict";
  const panel=document.getElementById("workflowMotion");
  if(!panel)return;
  const packet=panel.querySelector("[data-workflow-packet]");
  const progressBar=panel.querySelector("[data-workflow-progress]");
  const nodes=[...panel.querySelectorAll("[data-workflow-node]")];
  const steps=[...panel.querySelectorAll("[data-workflow-step]")];
  const toggle=panel.querySelector("[data-motion-toggle]");
  const captionTitle=panel.querySelector("[data-workflow-caption-title]");
  const captionCopy=panel.querySelector("[data-workflow-caption-copy]");
  if(!packet||!progressBar||nodes.length!==4||steps.length!==4||!toggle||!captionTitle||!captionCopy)return;

  // Illustrative concepts, not claims about actual jobs executing in this session.
  const stages=[
    ["Data sources","Route geometry, places and contextual observations form the inputs."],
    ["Structured workflow","Normalize route alternatives, quality checks and freshness signals."],
    ["Automation","Apply preference-weighted ranking and retain confidence separately."],
    ["Reporting","Explain the route score, trade-offs and journey impact clearly."]
  ];
  const media=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):null;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const blocked=()=>Boolean(media&&media.matches)||Boolean(connection&&connection.saveData);
  let paused=false,visible=true,frame=null,lastTime=null,progress=0,activeStage=-1;
  const duration=12000,from=24,to=288;

  function activate(stage){
    if(stage===activeStage)return;
    activeStage=stage;
    nodes.forEach((node,i)=>node.classList.toggle("is-active",i===stage));
    steps.forEach((step,i)=>{
      const selected=i===stage;
      step.classList.toggle("is-active",selected);
      step.setAttribute("aria-pressed",String(selected));
    });
    captionTitle.textContent=stages[stage][0];
    captionCopy.textContent=stages[stage][1];
  }
  function render(){
    packet.setAttribute("cx",(from+progress*(to-from)).toFixed(2));
    progressBar.style.transform="scaleX("+progress.toFixed(4)+")";
    activate(Math.min(3,Math.round(progress*3)));
  }
  function updateToggle(){
    const unavailable=blocked();
    toggle.disabled=unavailable;
    toggle.textContent=unavailable?"Motion off":paused?"Play motion":"Pause motion";
    toggle.setAttribute("aria-label",unavailable?"Animation disabled by motion or data-saving preference":paused?"Play workflow animation":"Pause workflow animation");
  }
  function shouldAnimate(){
    return !paused&&!blocked()&&visible&&document.visibilityState!=="hidden";
  }
  function stop(){
    if(frame!==null){window.cancelAnimationFrame(frame);frame=null;}
    lastTime=null;
  }
  function tick(now){
    frame=null;
    if(!shouldAnimate()){stop();return;}
    if(lastTime!==null)progress=(progress+Math.max(0,Math.min(70,now-lastTime))/duration)%1;
    lastTime=now;
    render();
    frame=window.requestAnimationFrame(tick);
  }
  function sync(){
    updateToggle();
    if(!shouldAnimate()){stop();return;}
    if(frame===null)frame=window.requestAnimationFrame(tick);
  }
  toggle.addEventListener("click",()=>{
    if(blocked())return;
    paused=!paused;
    sync();
  });
  steps.forEach((step,index)=>{
    step.addEventListener("click",()=>{
      paused=true;
      progress=index/3;
      stop();
      render();
      updateToggle();
    });
  });
  document.addEventListener("visibilitychange",sync);
  if("IntersectionObserver" in window){
    const observer=new IntersectionObserver(entries=>{
      visible=entries[0]?entries[0].isIntersecting:true;
      sync();
    },{threshold:.05});
    observer.observe(panel);
  }
  if(media){
    if(media.addEventListener)media.addEventListener("change",sync);
    else if(media.addListener)media.addListener(sync);
  }
  if(connection&&connection.addEventListener)connection.addEventListener("change",sync);
  if(window.matchMedia&&window.matchMedia("(pointer:fine)").matches){
    panel.addEventListener("pointermove",event=>{
      const r=panel.getBoundingClientRect();
      if(!r.width||!r.height)return;
      const x=Math.max(0,Math.min(100,(event.clientX-r.left)/r.width*100));
      const y=Math.max(0,Math.min(100,(event.clientY-r.top)/r.height*100));
      panel.style.setProperty("--spot-x",x.toFixed(1)+"%");
      panel.style.setProperty("--spot-y",y.toFixed(1)+"%");
    },{passive:true});
    panel.addEventListener("pointerleave",()=>{
      panel.style.setProperty("--spot-x","16%");
      panel.style.setProperty("--spot-y","12%");
    });
  }
  window.addEventListener("pagehide",stop);
  window.addEventListener("pageshow",sync);
  render();
  sync();
})();
