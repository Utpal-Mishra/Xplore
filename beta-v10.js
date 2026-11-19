// XPLORE Ireland v1.0.0 — Beta readiness, privacy controls and Founding Tester mode.
(function(){
  'use strict';

  const core=globalThis.XploreBetaCore;
  if(!core){console.error('XPLORE v1.0 beta core unavailable.');return;}

  const TESTER_KEY='xplore:v10:founding-tester';
  const stateV10={diagnostics:null};

  function ensureStyles(){
    if(document.querySelector('link[data-xplore-beta]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='beta-v10.css?v=1.0.0';link.dataset.xploreBeta='true';
    document.head.appendChild(link);
  }

  function randomTesterId(){
    try{
      const bytes=new Uint8Array(5);
      crypto.getRandomValues(bytes);
      return 'FT-'+[...bytes].map(x=>x.toString(36).padStart(2,'0')).join('').toUpperCase().slice(0,8);
    }catch(error){
      return 'FT-'+Date.now().toString(36).toUpperCase().slice(-8);
    }
  }

  function deviceClass(){
    const ua=String(navigator.userAgent||'').toLowerCase();
    if(/ipad|tablet/.test(ua))return 'tablet';
    if(/iphone|ipad/.test(ua))return 'ios';
    if(/android/.test(ua))return 'android';
    if(/windows|macintosh|linux/.test(ua))return 'desktop';
    return 'other';
  }

  function readTester(){
    try{
      const raw=localStorage.getItem(TESTER_KEY);
      return raw?core.safeTesterProfile(JSON.parse(raw)):null;
    }catch(error){return null;}
  }

  function writeTester(profile){
    const safe=core.safeTesterProfile(profile);
    try{localStorage.setItem(TESTER_KEY,JSON.stringify(safe));}catch(error){}
    return safe;
  }

  function ensureUI(){
    if(document.getElementById('betaReadinessCard'))return;
    const right=document.querySelector('.right');if(!right)return;
    const pilotTitle=[...right.querySelectorAll('.section-title')].find(el=>el.textContent.trim()==='Pilot Boundary');

    const title=document.createElement('h2');
    title.className='section-title';title.textContent='Beta Readiness';

    const card=document.createElement('div');
    card.id='betaReadinessCard';card.className='card beta-card';
    card.innerHTML=`
      <div class="beta-head">
        <div><span class="beta-kicker">v1.0 · Public Beta Controls</span><strong>Reliability, privacy and tester evidence</strong></div>
        <span class="beta-state" id="betaOverallState">Checking…</span>
      </div>
      <div class="beta-checks" id="betaChecks">
        <div><span>App release</span><strong>Checking</strong></div>
        <div><span>Transit data</span><strong>Checking</strong></div>
        <div><span>GTFS shapes</span><strong>Checking</strong></div>
        <div><span>Monitoring</span><strong>Configured</strong></div>
      </div>

      <details class="beta-section" open>
        <summary>Privacy controls</summary>
        <p>XPLORE v1.0 keeps the v0.6 local-learning boundary: analytics exclude raw GPS, typed addresses, Eircodes, destination names and search text. No governed remote collector is configured by default.</p>
        <label class="beta-toggle">
          <input id="betaLocalAnalytics" type="checkbox">
          <span><strong>Local product analytics</strong><small>Store coarse journey events on this device for up to 30 days.</small></span>
        </label>
        <div class="beta-privacy-grid">
          <div><span>Raw GPS history</span><strong>Not stored by analytics</strong></div>
          <div><span>Typed addresses / Eircodes</span><strong>Excluded</strong></div>
          <div><span>Remote analytics collector</span><strong id="betaRemoteCollector">Not configured</strong></div>
          <div><span>Local retention</span><strong>30 days · capped</strong></div>
        </div>
        <div class="beta-actions">
          <button type="button" id="betaExportLearning">Export my local data</button>
          <button type="button" id="betaClearLearning">Clear my local data</button>
        </div>
      </details>

      <details class="beta-section" id="foundingTesterSection">
        <summary>Founding Tester programme</summary>
        <p class="beta-tester-note">Tester mode is local and pseudonymous. It does not register your name or email with a server. Choose what you want to test, then export a tester pack when you want to share evidence.</p>
        <div class="beta-tester-id"><span>Tester ID</span><strong id="betaTesterId">Not enrolled</strong></div>
        <div class="beta-focus" id="betaFocus">
          <label><input type="checkbox" value="search"> Search & addresses</label>
          <label><input type="checkbox" value="route_quality"> Route quality</label>
          <label><input type="checkbox" value="decision_intelligence"> Decision Intelligence</label>
          <label><input type="checkbox" value="navigation"> Live navigation</label>
          <label><input type="checkbox" value="transit"> Public transport</label>
          <label><input type="checkbox" value="accessibility"> Accessibility evidence</label>
          <label><input type="checkbox" value="privacy"> Privacy controls</label>
        </div>
        <label class="beta-consent"><input id="betaTesterConsent" type="checkbox"> I understand XPLORE is a beta decision-support product, may be inaccurate, and must not be treated as safety-critical navigation.</label>
        <div class="beta-actions">
          <button type="button" id="betaActivateTester">Activate Tester Mode</button>
          <button type="button" id="betaExportTester" disabled>Export Tester Pack</button>
          <button type="button" id="betaResetTester" disabled>Reset Tester Mode</button>
        </div>
        <p class="beta-public-report">For a non-sensitive software issue, use the <a href="https://github.com/Utpal-Mishra/Xplore/issues/new?template=beta-bug.yml" target="_blank" rel="noopener noreferrer">public beta bug form</a>. Never post exact home/work locations, GPS coordinates, Eircodes or personal journey details.</p>
      </details>

      <p class="beta-monitor-note">Operational monitoring checks the public application and transport-data freshness only. It does not receive user location or tester data.</p>
    `;

    if(pilotTitle){right.insertBefore(title,pilotTitle);right.insertBefore(card,pilotTitle);}
    else right.append(title,card);

    bindUI();
    restoreTesterUI();
    runDiagnostics();
  }

  function bindUI(){
    const analytics=document.getElementById('betaLocalAnalytics');
    if(analytics){
      analytics.checked=globalThis.XploreLearning?.localAnalyticsEnabled?.()!==false;
      analytics.addEventListener('change',()=>{
        globalThis.XploreLearning?.setLocalAnalyticsEnabled?.(analytics.checked);
        globalThis.XploreLearning?.track?.('privacy_local_analytics_changed',{enabled:analytics.checked});
      });
    }
    document.getElementById('betaExportLearning')?.addEventListener('click',()=>globalThis.XploreLearning?.exportLearningData?.());
    document.getElementById('betaClearLearning')?.addEventListener('click',()=>globalThis.XploreLearning?.clearLearningData?.());
    document.getElementById('betaActivateTester')?.addEventListener('click',activateTester);
    document.getElementById('betaExportTester')?.addEventListener('click',exportTesterPack);
    document.getElementById('betaResetTester')?.addEventListener('click',resetTester);
  }

  function selectedFocus(){
    return [...document.querySelectorAll('#betaFocus input:checked')].map(x=>x.value);
  }

  function activateTester(){
    const consent=Boolean(document.getElementById('betaTesterConsent')?.checked);
    const focus=selectedFocus();
    if(!consent||!focus.length){
      setTesterMessage('Choose at least one focus area and accept the beta acknowledgement.',true);
      return;
    }
    const existing=readTester();
    const profile=writeTester({
      testerId:existing?.testerId||randomTesterId(),
      createdAt:existing?.createdAt||Date.now(),
      deviceClass:deviceClass(),
      focus,
      betaConsent:true,
      localAnalytics:globalThis.XploreLearning?.localAnalyticsEnabled?.()!==false
    });
    globalThis.XploreLearning?.track?.('founding_tester_activated',{device_class:profile.deviceClass,focus_count:profile.focus.length});
    restoreTesterUI();
    setTesterMessage('Tester Mode is active on this device. Export a Tester Pack when you want to share evidence.');
  }

  function setTesterMessage(message,error=false){
    const note=document.querySelector('.beta-tester-note');
    if(note){note.textContent=message;note.dataset.tone=error?'error':'success';}
  }

  function restoreTesterUI(){
    const profile=readTester();
    const id=document.getElementById('betaTesterId');
    const exportButton=document.getElementById('betaExportTester');
    const reset=document.getElementById('betaResetTester');
    if(id)id.textContent=profile?.testerId||'Not enrolled';
    if(exportButton)exportButton.disabled=!core.testerEligible(profile);
    if(reset)reset.disabled=!profile;
    if(profile){
      document.querySelectorAll('#betaFocus input').forEach(input=>{input.checked=profile.focus.includes(input.value);});
      const consent=document.getElementById('betaTesterConsent');if(consent)consent.checked=profile.betaConsent;
    }
  }

  function exportTesterPack(){
    const profile=readTester();if(!core.testerEligible(profile))return;
    const learning=globalThis.XploreLearning?.exportPayload?.()||{events:[],feedback:[]};
    const pack=core.testerPack(profile,learning);
    const blob=new Blob([JSON.stringify(pack,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='xplore-founding-tester-'+profile.testerId+'.json';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    globalThis.XploreLearning?.track?.('founding_tester_pack_exported',{focus_count:profile.focus.length});
    setTesterMessage('Tester Pack exported. Review it before sharing.');
  }

  function resetTester(){
    if(!confirm('Reset Founding Tester Mode on this device? Your journey learning data will not be deleted.'))return;
    try{localStorage.removeItem(TESTER_KEY);}catch(error){}
    document.querySelectorAll('#betaFocus input').forEach(input=>{input.checked=false;});
    const consent=document.getElementById('betaTesterConsent');if(consent)consent.checked=false;
    restoreTesterUI();
    setTesterMessage('Tester Mode reset. Local learning data is unchanged.');
  }

  function renderCheck(container,label,ok,detail){
    const row=document.createElement('div');
    row.dataset.tone=ok?'success':'warning';
    row.innerHTML='<span>'+label+'</span><strong>'+(ok?'Pass':'Check')+(detail?' · '+detail:'')+'</strong>';
    container.appendChild(row);
  }

  async function runDiagnostics(){
    const container=document.getElementById('betaChecks');
    const overall=document.getElementById('betaOverallState');
    try{
      const version=document.querySelector('.header-meta .pill')?.textContent||'';
      const manifest=await fetch('data/transit/manifest.json?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
      const age=core.serviceDateAgeDays(manifest?.serviceDate);
      const readiness=core.betaReadiness({
        release:version.includes('v1.0.0')?'1.0.0':'unknown',
        https:location.protocol==='https:'||location.hostname==='localhost',
        transitAvailable:Boolean(manifest?.available),
        transitAgeDays:age,
        shapeCount:manifest?.shapeCount||0,
        privacyControls:Boolean(globalThis.XploreLearning),
        monitoringConfigured:true
      });
      stateV10.diagnostics={manifest,readiness};
      if(container){
        container.innerHTML='';
        renderCheck(container,'App release',readiness.checks.find(x=>x.id==='release')?.ok,'v1.0.0');
        renderCheck(container,'Transit data',Boolean(manifest?.available),manifest?.serviceDate||'unavailable');
        renderCheck(container,'GTFS shapes',Number(manifest?.shapeCount)>0,manifest?.shapeCount?manifest.shapeCount+' active':'fallback');
        renderCheck(container,'Monitoring',true,'scheduled smoke checks');
      }
      if(overall){
        overall.textContent=readiness.status==='pass'?'Beta checks passed':readiness.status==='warning'?'Beta checks with warning':'Beta check failed';
        overall.dataset.tone=readiness.status;
      }
    }catch(error){
      if(overall){overall.textContent='Diagnostics unavailable';overall.dataset.tone='warning';}
    }
  }

  function setVersion(){
    if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v1.0.0 Beta';
    const badge=document.querySelector('.header-meta .pill');
    if(badge)badge.textContent='Ireland v1.0.0 Beta';
  }

  function init(){
    ensureStyles();
    ensureUI();
    setVersion();
  }

  globalThis.XploreBeta={readTester,runDiagnostics};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
