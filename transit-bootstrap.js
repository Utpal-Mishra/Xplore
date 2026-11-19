// XPLORE v0.9.0 — inject Transit, Live Mobility, geometry and fare evidence status.
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
        '<div class="transit-source-row"><span>Geometry</span><strong id="transitGeometryStatus">Exact GTFS shapes load for selected itinerary</strong></div>'+
        '<div class="transit-source-row"><span>Fare evidence</span><strong id="transitFareEvidence">Official fare reference loads when eligibility can be bounded</strong></div>'+
        '<div class="transit-source-row live-mobility-row"><span>Live mobility</span><strong id="transitRealtimeStatus">NTA realtime snapshot loads with Transit results</strong></div>'+
        '<div class="transit-source-row"><span>Trip timing</span><strong id="transitTripLive">Exact-match live timing pending</strong></div>'+
        '<div class="transit-source-row"><span>Vehicle</span><strong id="transitVehicleLive">Live vehicle position pending</strong></div>'+
        '<div class="transit-source-row"><span>Alerts</span><strong id="transitAlertLive">Route-specific alerts pending</strong></div>'+
        '<div class="transit-source-row"><span>Irish Rail</span><strong id="transitRailLive">Public rail realtime is used as a fallback/cross-check</strong></div>'+
        '<p class="transit-live-note">v0.9 uses official GTFS source shapes when available and a bounded planner supporting up to two transfers. Fare values are reference evidence only unless eligibility can be proven; fares do not affect XPLORE Score. Live NTA data still uses the v0.7 exact-match freshness safeguards.</p>';
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
