/* XPLORE v0.5.4: illustrative data-to-decision flow animation.
   No analytics, network, geolocation, routing or background timers. */
(()=>{
  "use strict";
  const panel=document.getElementById("workflowMotion");
  if(!panel)return;
  const track=panel.querySelector("[data-workflow-track]");
  const packet=panel.querySelector("[data-workflow-packet]");
  const nodes=[...panel.querySelectorAll("[data-workflow-node]")];
  const labels=[...panel.querySelectorAll("[data-workflow-step]")];
  const toggle=panel.querySelector("[data-motion-toggle]");
  if(!track||!packet||nodes.length!==4||labels.length!==4||!toggle)return;
  const reduced=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):null;
  let paused=Boolean(reduced&&reduced.matches);
  let visible=true,frame=null,lastTime=null,progress=0,activeStage=-1;
  const duration=11000;
  const positions=[24,112,200,288];
  function activate(stage){
    if(stage===activeStage)return;
    activeStage=stage;
    nodes.forEach((node,i)=>node.classList.toggle("is-active",i===stage));
    labels.forEach((label,i)=>label.classList.toggle("is-active",i===stage));
  }
  function render(){
    const x=positions[0]+progress*(positions[3]-positions[0]);
    packet.setAttribute("cx",x.toFixed(2));
    packet.setAttribute("cy","36");
    activate(Math.min(3,Math.floor(progress*4)));
  }
  function updateToggle(){
    toggle.textContent=paused?"Play motion":"Pause motion";
    toggle.setAttribute("aria-label",paused?"Play workflow animation":"Pause workflow animation");
  }
  function shouldAnimate(){
    return !paused&&visible&&document.visibilityState!=="hidden";
  }
  function stop(){
    if(frame!==null){window.cancelAnimationFrame(frame);frame=null;}
    lastTime=null;
  }
  function tick(now){
    frame=null;
    if(!shouldAnimate()){stop();return;}
    if(lastTime!==null)progress=(progress+Math.min(70,now-lastTime)/duration)%1;
    lastTime=now;
    render();
    frame=window.requestAnimationFrame(tick);
  }
  function sync(){
    if(!shouldAnimate()){stop();return;}
    if(frame===null)frame=window.requestAnimationFrame(tick);
  }
  toggle.addEventListener("click",()=>{
    paused=!paused;updateToggle();sync();
  });
  document.addEventListener("visibilitychange",sync);
  if("IntersectionObserver" in window){
    const observer=new IntersectionObserver((entries)=>{
      visible=entries[0]?entries[0].isIntersecting:true;sync();
    },{threshold:0.05});
    observer.observe(panel);
  }
  if(reduced){
    const onPreferenceChange=(event)=>{
      if(event.matches)paused=true;
      updateToggle();sync();
    };
    if(reduced.addEventListener)reduced.addEventListener("change",onPreferenceChange);
    else if(reduced.addListener)reduced.addListener(onPreferenceChange);
  }
  if(window.matchMedia&&window.matchMedia("(pointer:fine)").matches){
    panel.addEventListener("pointermove",(event)=>{
      const r=panel.getBoundingClientRect();
      panel.style.setProperty("--spot-x",((event.clientX-r.left)/r.width*100).toFixed(1)+"%");
      panel.style.setProperty("--spot-y",((event.clientY-r.top)/r.height*100).toFixed(1)+"%");
    },{passive:true});
  }
  window.addEventListener("pagehide",stop);
  window.addEventListener("pageshow",sync);
  render();updateToggle();sync();
})();
