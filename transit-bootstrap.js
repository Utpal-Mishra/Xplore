// XPLORE v0.7.0 — inject Transit mode and Live Mobility status without duplicating the page shell.
(function(){
  function ensureTransitUI(){
    const modeRow=document.querySelector('.mode-row');
    if(modeRow&&!modeRow.querySelector('[data-mode="transit"]')){
      const button=document.createElement('button');
      button.className='mode';button.dataset.mode='transit';button.type='button';button.textContent='Transit';
      modeRow.appendChild(button);
      button.addEventListener('click',()=>{
        document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));
        button.classList.add('active');
        state.mode='transit';
      });
    }

    const right=document.querySelector('aside.right');
    if(right&&!document.getElementById('transitPanel')){
      const heading=document.createElement('h2');
      heading.className='section-title';heading.id='transitPanelHeading';heading.textContent='Public Transport';heading.hidden=true;
      const panel=document.createElement('div');
      panel.id='transitPanel';panel.className='card transit-panel';panel.hidden=true;
      panel.innerHTML=
        '<div class="transit-source-row"><span>Schedule</span><strong id="transitDataStatus">NTA GTFS loads when Transit is selected</strong></div>'+
        '<div class="transit-source-row"><span>Service date</span><strong id="transitScheduleStamp">Daily Ireland schedule</strong></div>'+
        '<div class="transit-source-row live-mobility-row"><span>Live mobility</span><strong id="transitRealtimeStatus">NTA realtime snapshot loads with Transit results</strong></div>'+
        '<div class="transit-source-row"><span>Trip timing</span><strong id="transitTripLive">Exact-match live timing pending</strong></div>'+
        '<div class="transit-source-row"><span>Vehicle</span><strong id="transitVehicleLive">Live vehicle position pending</strong></div>'+
        '<div class="transit-source-row"><span>Alerts</span><strong id="transitAlertLive">Route-specific alerts pending</strong></div>'+
        '<div class="transit-source-row"><span>Irish Rail</span><strong id="transitRailLive">Public rail realtime is used as a fallback/cross-check</strong></div>'+
        '<p class="transit-live-note">Live NTA data only affects XPLORE when today\'s realtime-compatible static trip and ordered stop sequence match exactly. Stale or unmatched data falls back to the schedule.</p>';
      const why=[...right.querySelectorAll('.section-title')].find(el=>el.textContent.trim()==='Why this route?');
      if(why){right.insertBefore(heading,why);right.insertBefore(panel,why);}else{right.appendChild(heading);right.appendChild(panel);}
    }

    document.querySelectorAll('.mode').forEach(button=>{
      if(button.dataset.transitVisibilityBound)return;
      button.dataset.transitVisibilityBound='true';
      button.addEventListener('click',()=>{
        const show=button.dataset.mode==='transit';
        const panel=document.getElementById('transitPanel'),heading=document.getElementById('transitPanelHeading');
        if(panel)panel.hidden=!show;if(heading)heading.hidden=!show;
      });
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureTransitUI,{once:true});
  else ensureTransitUI();
})();
