// XPLORE Ireland v0.6.0 — Learn: privacy-first feedback, product analytics and route-quality reporting.
(function(){
  'use strict';

  const core=globalThis.XploreLearningCore;
  if(!core){console.error('XPLORE v0.6 learning core unavailable.');return;}

  const VERSION='0.6.0';
  const EVENT_KEY='xplore:v06:events';
  const FEEDBACK_KEY='xplore:v06:feedback';
  const SHARE_KEY='xplore:v06:share';
  const SESSION_KEY='xplore:v06:session';
  const LOCAL_ANALYTICS_KEY='xplore:v10:local-analytics-enabled';
  const MAX_NOTE=240;
  const REMOTE_ENDPOINT=String(globalThis.XPLORE_LEARNING_ENDPOINT||'').trim();

  const learningState={
    initialised:false,
    journeyId:null,
    guidanceStartedAt:0,
    arrivalTracked:false,
    lastFeedbackJourneyId:null,
    storageAvailable:true,
    promptTimer:null
  };

  function randomId(prefix='xp'){
    try{
      if(globalThis.crypto?.randomUUID)return prefix+'-'+globalThis.crypto.randomUUID();
      if(globalThis.crypto?.getRandomValues){
        const bytes=new Uint32Array(2);globalThis.crypto.getRandomValues(bytes);
        return prefix+'-'+[...bytes].map(v=>v.toString(36)).join('');
      }
    }catch(error){}
    return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  }

  function sessionId(){
    try{
      let value=sessionStorage.getItem(SESSION_KEY);
      if(!value){value=randomId('s');sessionStorage.setItem(SESSION_KEY,value);}
      return value;
    }catch(error){return 'session-unavailable';}
  }

  function readList(key){
    try{
      const raw=localStorage.getItem(key);
      const parsed=raw?JSON.parse(raw):[];
      return core.retainRecent(parsed,Date.now(),30,400);
    }catch(error){
      learningState.storageAvailable=false;
      return [];
    }
  }

  function writeList(key,items){
    try{
      localStorage.setItem(key,JSON.stringify(core.retainRecent(items,Date.now(),30,400)));
      learningState.storageAvailable=true;
      return true;
    }catch(error){
      learningState.storageAvailable=false;
      refreshPrivacyCopy();
      return false;
    }
  }

  function localAnalyticsEnabled(){
    try{return localStorage.getItem(LOCAL_ANALYTICS_KEY)!=='false';}
    catch(error){return true;}
  }

  function setLocalAnalyticsEnabled(enabled){
    try{localStorage.setItem(LOCAL_ANALYTICS_KEY,enabled?'true':'false');}catch(error){}
    if(!enabled)setSharingEnabled(false);
    refreshPrivacyCopy();
    return localAnalyticsEnabled();
  }

  function sharingEnabled(){
    if(!REMOTE_ENDPOINT||!localAnalyticsEnabled())return false;
    try{return localStorage.getItem(SHARE_KEY)==='true';}catch(error){return false;}
  }

  function setSharingEnabled(enabled){
    if(!REMOTE_ENDPOINT)return;
    try{localStorage.setItem(SHARE_KEY,enabled?'true':'false');}catch(error){}
    refreshPrivacyCopy();
  }

  function remoteSend(kind,payload){
    if(!REMOTE_ENDPOINT||!sharingEnabled())return;
    const body=JSON.stringify({schema:'xplore-learning-v0.6',kind,session:sessionId(),payload});
    try{
      if(navigator.sendBeacon){
        const blob=new Blob([body],{type:'application/json'});
        if(navigator.sendBeacon(REMOTE_ENDPOINT,blob))return;
      }
    }catch(error){}
    fetch(REMOTE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  }

  function track(event,payload={}){
    const safe=core.sanitizeEvent(event,payload);
    const record={...safe,session:sessionId()};
    if(!localAnalyticsEnabled())return record;
    const events=readList(EVENT_KEY);
    events.push(record);
    writeList(EVENT_KEY,events);
    remoteSend('event',record);
    refreshLearningSummary();
    return record;
  }

  function providerForSelection(fieldId){
    try{
      const selected=typeof selectedAddress==='function'?selectedAddress(fieldId):null;
      return core.providerClass(selected?.provider);
    }catch(error){return 'unknown';}
  }

  function activeTransitItem(){
    try{
      if(typeof xploreTransitState==='undefined')return null;
      return xploreTransitState.itineraries?.[xploreTransitState.active]||null;
    }catch(error){return null;}
  }

  function currentJourneySnapshot(){
    const ri=state?.routeIntelligence||null;
    if(state?.mode==='transit'){
      const item=activeTransitItem();
      return core.compactJourneySnapshot({
        mode:'transit',
        preference:state?.preference,
        candidateCount:typeof xploreTransitState!=='undefined'?xploreTransitState.itineraries?.length:0,
        selectedRank:typeof xploreTransitState!=='undefined'?xploreTransitState.active:0,
        score:item?.score,
        durationS:item?.duration,
        confidence:item?.reliability,
        transfers:item?.transfers,
        routeIntelligenceConfidence:'not_applicable'
      });
    }
    const selected=state?.enrichedRoutes?.[state?.activeRoute]||null;
    const raw=selected?.raw||selected||null;
    return core.compactJourneySnapshot({
      mode:state?.mode,
      preference:state?.preference,
      candidateCount:state?.enrichedRoutes?.length||0,
      selectedRank:state?.activeRoute||0,
      score:selected?.score,
      distanceM:raw?.distance,
      durationS:raw?.duration,
      confidence:selected?.confidence,
      transfers:null,
      routeIntelligenceConfidence:ri?.confidence||'pending'
    });
  }

  function journeyAvailable(){
    if(state?.mode==='transit')return Boolean(activeTransitItem());
    return Boolean(state?.enrichedRoutes?.length&&state.enrichedRoutes[state.activeRoute]);
  }

  function ensureJourneyId(){
    if(!learningState.journeyId)learningState.journeyId=randomId('j');
    return learningState.journeyId;
  }

  function resetJourneyLearning(){
    learningState.journeyId=randomId('j');
    learningState.guidanceStartedAt=0;
    learningState.arrivalTracked=false;
    learningState.lastFeedbackJourneyId=null;
    setFeedbackAvailable(false);
    closeFeedback();
  }

  function feedbackTitleForMode(){
    return state?.mode==='transit'?'How useful is this transit recommendation?':'How was this route?';
  }

  function ensureStyles(){
    if(document.querySelector('link[data-xplore-learning]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='learning-v06.css?v='+VERSION;link.dataset.xploreLearning='true';
    document.head.appendChild(link);
  }

  function ensureUI(){
    if(document.getElementById('learningCard'))return;
    const right=document.querySelector('.right');
    if(!right)return;

    const pilotTitle=[...right.querySelectorAll('.section-title')].find(el=>el.textContent.trim()==='Pilot Boundary');
    const title=document.createElement('h2');
    title.className='section-title';title.textContent='Journey Feedback';

    const card=document.createElement('div');
    card.id='learningCard';card.className='card learning-card';
    card.innerHTML=`
      <div class="learning-head">
        <div>
          <span class="learning-kicker">v0.6 · Learn</span>
          <strong id="learningHeading">Help XPLORE improve this recommendation</strong>
        </div>
        <button class="learning-open" id="learningOpen" type="button" disabled>Give feedback</button>
        <button class="learning-close" id="learningClose" type="button" aria-label="Close feedback">×</button>
      </div>
      <p class="learning-prompt" id="learningPrompt">Run a journey first. Feedback becomes available once XPLORE has a recommendation to evaluate.</p>
      <form class="learning-form" id="learningForm" hidden>
        <div class="learning-question">
          <span id="learningRatingLabel">How was this route?</span>
          <div class="learning-rating-row" role="group" aria-labelledby="learningRatingLabel">
            <button class="learning-answer learning-rating" type="button" data-learning-rating="good">Good</button>
            <button class="learning-answer learning-rating" type="button" data-learning-rating="okay">Okay</button>
            <button class="learning-answer learning-rating" type="button" data-learning-rating="poor">Poor</button>
          </div>
        </div>
        <details class="learning-details" id="learningDetails">
          <summary>Add route-quality details</summary>
          <div class="learning-question">
            <span>Was the destination correct?</span>
            <div class="learning-answer-row">
              <button class="learning-answer" type="button" data-learning-destination="yes">Yes</button>
              <button class="learning-answer" type="button" data-learning-destination="no">No</button>
              <button class="learning-answer" type="button" data-learning-destination="unsure">Unsure</button>
            </div>
          </div>
          <div class="learning-question">
            <span>What should XPLORE improve?</span>
            <div class="learning-issues">
              <button class="learning-issue" type="button" data-learning-issue="wrong_destination">Wrong destination</button>
              <button class="learning-issue" type="button" data-learning-issue="route_quality">Route quality</button>
              <button class="learning-issue" type="button" data-learning-issue="eta">ETA</button>
              <button class="learning-issue" type="button" data-learning-issue="missing_map_data">Map data</button>
              <button class="learning-issue" type="button" data-learning-issue="safety">Safety</button>
              <button class="learning-issue" type="button" data-learning-issue="accessibility">Accessibility</button>
              <button class="learning-issue" type="button" data-learning-issue="transit">Transit</button>
              <button class="learning-issue" type="button" data-learning-issue="other">Other</button>
            </div>
          </div>
          <div class="learning-question">
            <span>Would you choose XPLORE's recommendation over simply taking the fastest route?</span>
            <div class="learning-answer-row">
              <button class="learning-answer" type="button" data-learning-fastest="yes">Yes</button>
              <button class="learning-answer" type="button" data-learning-fastest="no">No</button>
              <button class="learning-answer" type="button" data-learning-fastest="unsure">Unsure</button>
            </div>
          </div>
          <div class="learning-question">
            <label for="learningNote">Optional note · stored locally on this device</label>
            <textarea class="learning-note" id="learningNote" maxlength="${MAX_NOTE}" placeholder="Anything XPLORE should understand about this route?"></textarea>
            <div class="learning-note-meta"><span>Free text is never sent by the anonymous analytics adapter.</span><span id="learningNoteCount">0/${MAX_NOTE}</span></div>
          </div>
        </details>
        <button class="learning-submit" id="learningSubmit" type="submit" disabled>Save feedback</button>
      </form>
      <div class="learning-saved" id="learningSaved" hidden>Feedback saved on this device. Thank you — this is now part of XPLORE's local learning record.</div>
      <div class="learning-summary">
        <div class="learning-summary-title"><span>30-day local funnel</span><span id="learningStorageState">Local only</span></div>
        <div class="learning-funnel">
          <div><strong id="learnSearches">0</strong><span>Searches</span></div>
          <div><strong id="learnResults">0</strong><span>Results</span></div>
          <div><strong id="learnGuidance">0</strong><span>Guidance</span></div>
          <div><strong id="learnArrivals">0</strong><span>Arrivals</span></div>
          <div><strong id="learnFeedback">0</strong><span>Feedback</span></div>
        </div>
        <p class="learning-privacy" id="learningPrivacy">XPLORE stores only coarse journey metrics locally. Raw GPS, typed addresses, Eircodes and destination names are excluded from analytics.</p>
        <label class="learning-share" id="learningShareRow" hidden><input id="learningShare" type="checkbox"> Share anonymous coarse metrics with the configured XPLORE collector</label>
        <div class="learning-tools">
          <button class="learning-small-button" id="learningExport" type="button">Export learning data</button>
          <button class="learning-small-button" id="learningClear" type="button">Clear local learning</button>
        </div>
      </div>`;

    if(pilotTitle){
      right.insertBefore(title,pilotTitle);
      right.insertBefore(card,pilotTitle);
    }else{
      right.append(title,card);
    }

    const guidanceActions=document.querySelector('.guidance-actions');
    if(guidanceActions&&!document.getElementById('learningRouteShortcut')){
      const shortcut=document.createElement('button');
      shortcut.id='learningRouteShortcut';shortcut.type='button';shortcut.className='learning-route-shortcut';
      shortcut.textContent='Feedback';shortcut.hidden=true;
      guidanceActions.appendChild(shortcut);
    }

    const toast=document.createElement('div');
    toast.id='learningToast';toast.className='learning-toast';toast.setAttribute('role','status');
    document.body.appendChild(toast);

    bindUI();
    refreshLearningSummary();
    refreshPrivacyCopy();
  }

  function bindExclusive(selector,attribute){
    document.querySelectorAll(selector).forEach(button=>{
      button.addEventListener('click',()=>{
        document.querySelectorAll(selector).forEach(x=>x.classList.remove('active'));
        button.classList.add('active');
        button.dataset.selected='true';
        validateFeedback();
      });
    });
  }

  function bindUI(){
    document.getElementById('learningOpen')?.addEventListener('click',()=>openFeedback('manual'));
    document.getElementById('learningClose')?.addEventListener('click',closeFeedback);
    document.getElementById('learningRouteShortcut')?.addEventListener('click',()=>openFeedback('route_shortcut'));

    bindExclusive('[data-learning-rating]','learningRating');
    bindExclusive('[data-learning-destination]','learningDestination');
    bindExclusive('[data-learning-fastest]','learningFastest');

    document.querySelectorAll('[data-learning-issue]').forEach(button=>button.addEventListener('click',()=>{
      button.classList.toggle('active');validateFeedback();
    }));

    const note=document.getElementById('learningNote');
    note?.addEventListener('input',()=>{
      const count=document.getElementById('learningNoteCount');
      if(count)count.textContent=note.value.length+'/'+MAX_NOTE;
    });

    document.getElementById('learningForm')?.addEventListener('submit',submitFeedback);
    document.getElementById('learningExport')?.addEventListener('click',exportLearningData);
    document.getElementById('learningClear')?.addEventListener('click',clearLearningData);

    const share=document.getElementById('learningShare');
    if(share){
      share.checked=sharingEnabled();
      share.addEventListener('change',()=>setSharingEnabled(share.checked));
    }

    document.addEventListener('click',event=>{
      const routeButton=event.target.closest?.('[data-route],[data-transit-route]');
      if(routeButton){
        const rank=Number(routeButton.dataset.route??routeButton.dataset.transitRoute??0);
        track('route_candidate_selected',{mode:state?.mode||'unknown',rank:Number.isFinite(rank)?rank:0});
      }
      const modeButton=event.target.closest?.('.mode[data-mode]');
      if(modeButton)track('travel_mode_selected',{mode:modeButton.dataset.mode||'unknown'});
      const prefButton=event.target.closest?.('.choice[data-pref]');
      if(prefButton)track('preference_selected',{preference:prefButton.dataset.pref||'Balanced'});
    },true);
  }

  function selectedValue(selector,attribute){
    const active=document.querySelector(selector+'.active');
    return active?active.getAttribute(attribute):null;
  }

  function validateFeedback(){
    const rating=selectedValue('[data-learning-rating]','data-learning-rating');
    const submit=document.getElementById('learningSubmit');
    if(submit)submit.disabled=!rating;
  }

  function setFeedbackAvailable(available){
    const open=document.getElementById('learningOpen');
    const shortcut=document.getElementById('learningRouteShortcut');
    const prompt=document.getElementById('learningPrompt');
    if(open)open.disabled=!available;
    if(shortcut)shortcut.hidden=!available;
    if(prompt){
      prompt.textContent=available
        ?'Tell XPLORE whether this recommendation matched the real journey. Detailed reporting is optional.'
        :'Run a journey first. Feedback becomes available once XPLORE has a recommendation to evaluate.';
    }
    const label=document.getElementById('learningRatingLabel');
    if(label)label.textContent=feedbackTitleForMode();
  }

  function openFeedback(reason='manual'){
    if(!journeyAvailable())return;
    ensureJourneyId();
    const card=document.getElementById('learningCard');
    const form=document.getElementById('learningForm');
    const saved=document.getElementById('learningSaved');
    if(card){card.classList.add('is-open');if(reason!=='manual'&&reason!=='route_shortcut')card.classList.add('is-prompted');}
    if(form)form.hidden=false;
    if(saved)saved.hidden=true;
    track('feedback_opened',{mode:state?.mode||'unknown',reason});
    if(reason==='manual'||reason==='route_shortcut')card?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  }

  function closeFeedback(){
    const card=document.getElementById('learningCard');
    const form=document.getElementById('learningForm');
    if(card){card.classList.remove('is-open');card.classList.remove('is-prompted');}
    if(form)form.hidden=true;
  }

  function resetFeedbackForm(){
    document.querySelectorAll('[data-learning-rating],[data-learning-destination],[data-learning-fastest],[data-learning-issue]').forEach(el=>el.classList.remove('active'));
    const note=document.getElementById('learningNote');if(note)note.value='';
    const count=document.getElementById('learningNoteCount');if(count)count.textContent='0/'+MAX_NOTE;
    const details=document.getElementById('learningDetails');if(details)details.open=false;
    validateFeedback();
  }

  function submitFeedback(event){
    event.preventDefault();
    if(!journeyAvailable())return;
    const rating=selectedValue('[data-learning-rating]','data-learning-rating');
    if(!rating)return;
    const destinationCorrect=selectedValue('[data-learning-destination]','data-learning-destination')||'unsure';
    const recommendOverFastest=selectedValue('[data-learning-fastest]','data-learning-fastest')||'unsure';
    const issues=[...document.querySelectorAll('[data-learning-issue].active')].map(el=>el.dataset.learningIssue);
    const note=(document.getElementById('learningNote')?.value||'').trim().slice(0,MAX_NOTE);
    const journey=currentJourneySnapshot();
    const record={
      id:randomId('f'),
      ts:Date.now(),
      session:sessionId(),
      journeyId:ensureJourneyId(),
      rating,destinationCorrect,recommendOverFastest,issues,note,journey
    };
    const feedback=readList(FEEDBACK_KEY);feedback.push(record);writeList(FEEDBACK_KEY,feedback);
    learningState.lastFeedbackJourneyId=record.journeyId;
    remoteSend('feedback',core.compactFeedbackForSharing(record));
    track('feedback_submitted',{mode:state?.mode||'unknown',rating,issue_count:issues.length});
    const saved=document.getElementById('learningSaved');if(saved)saved.hidden=false;
    const form=document.getElementById('learningForm');if(form)form.hidden=true;
    const card=document.getElementById('learningCard');card?.classList.remove('is-prompted');
    showToast('Journey feedback saved locally.');
    refreshLearningSummary();
    resetFeedbackForm();
  }

  function eventCount(events,name){return events.filter(e=>e.event===name).length;}

  function refreshLearningSummary(){
    const events=readList(EVENT_KEY),feedback=readList(FEEDBACK_KEY);
    const values={
      learnSearches:eventCount(events,'journey_search_started'),
      learnResults:eventCount(events,'journey_results_ready'),
      learnGuidance:eventCount(events,'guidance_started'),
      learnArrivals:eventCount(events,'journey_arrived'),
      learnFeedback:feedback.length
    };
    Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=String(value);});
    const storage=document.getElementById('learningStorageState');
    if(storage)storage.textContent=!localAnalyticsEnabled()?'Analytics off':learningState.storageAvailable?(REMOTE_ENDPOINT&&sharingEnabled()?'Anonymous sharing on':'Local only'):'Storage unavailable';
  }

  function refreshPrivacyCopy(){
    const privacy=document.getElementById('learningPrivacy');
    const shareRow=document.getElementById('learningShareRow');
    if(shareRow)shareRow.hidden=!REMOTE_ENDPOINT;
    if(!privacy)return;
    if(!localAnalyticsEnabled()){
      privacy.textContent='Local product analytics are off. XPLORE continues routing normally. Existing local learning records remain until you export or clear them.';
    }else if(!learningState.storageAvailable){
      privacy.textContent='Browser storage is unavailable. XPLORE will continue routing, but this device cannot retain learning events or feedback.';
    }else if(REMOTE_ENDPOINT){
      privacy.textContent='Coarse metrics are stored locally for 30 days. Anonymous sharing is optional. Raw GPS, typed addresses, Eircodes, destination names and free-text notes are excluded from shared analytics.';
    }else{
      privacy.textContent='Local-only beta: coarse metrics are stored on this device for 30 days. Raw GPS, typed addresses, Eircodes and destination names are excluded from analytics. A governed collector is not configured yet.';
    }
    refreshLearningSummary();
  }

  function learningExportPayload(){
    return {
      schema:'xplore-learning-v1-compatible',
      generatedAt:new Date().toISOString(),
      privacy:'User-initiated local export. Feedback notes may be included because the user explicitly exported their own device data.',
      localAnalyticsEnabled:localAnalyticsEnabled(),
      remoteCollectorConfigured:Boolean(REMOTE_ENDPOINT),
      anonymousSharingEnabled:sharingEnabled(),
      events:readList(EVENT_KEY),
      feedback:readList(FEEDBACK_KEY)
    };
  }

  function exportLearningData(){
    const exportPayload=learningExportPayload();
    const blob=new Blob([JSON.stringify(exportPayload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='xplore-learning-export-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    track('analytics_exported',{event_count:exportPayload.events.length,feedback_count:exportPayload.feedback.length});
  }

  function clearLearningData(){
    if(!confirm('Clear XPLORE learning events and feedback stored on this device?'))return;
    try{localStorage.removeItem(EVENT_KEY);localStorage.removeItem(FEEDBACK_KEY);}catch(error){}
    refreshLearningSummary();showToast('Local XPLORE learning data cleared.');
  }

  function showToast(message){
    const toast=document.getElementById('learningToast');if(!toast)return;
    toast.textContent=message;toast.classList.add('show');
    window.clearTimeout(learningState.promptTimer);
    learningState.promptTimer=window.setTimeout(()=>toast.classList.remove('show'),2600);
  }

  function promptAfterJourney(reason){
    if(!journeyAvailable())return;
    if(learningState.lastFeedbackJourneyId&&learningState.lastFeedbackJourneyId===learningState.journeyId)return;
    window.setTimeout(()=>openFeedback(reason),500);
  }

  function installHooks(){
    if(typeof confirmAddress==='function'){
      const baseConfirmAddress=confirmAddress;
      confirmAddress=function(fieldId,location,options){
        const result=baseConfirmAddress(fieldId,location,options);
        if(result)track('address_confirmed',{field:fieldId==='from'?'start':'destination',provider:core.providerClass(result.provider||location?.provider)});
        return result;
      };
    }

    if(typeof resetJourneyPresentation==='function'){
      const baseReset=resetJourneyPresentation;
      resetJourneyPresentation=function(){
        resetJourneyLearning();
        return baseReset.apply(this,arguments);
      };
    }

    if(typeof planJourney==='function'){
      const basePlan=planJourney;
      planJourney=async function(){
        ensureJourneyId();
        track('journey_search_started',{mode:state?.mode||'unknown',preference:state?.preference||'Balanced'});
        try{
          const result=await basePlan.apply(this,arguments);
          const count=state?.mode==='transit'
            ?(typeof xploreTransitState!=='undefined'?xploreTransitState.itineraries?.length||0:0)
            :(state?.enrichedRoutes?.length||0);
          if(count>0)track('journey_results_ready',{mode:state?.mode||'unknown',candidate_count:count});
          else track('journey_results_empty',{mode:state?.mode||'unknown'});
          setFeedbackAvailable(count>0);
          return result;
        }catch(error){
          track('journey_search_error',{mode:state?.mode||'unknown'});
          throw error;
        }
      };
    }

    if(typeof selectRoute==='function'){
      const baseSelectRoute=selectRoute;
      selectRoute=function(index,enriched){
        const result=baseSelectRoute.apply(this,arguments);
        setFeedbackAvailable(true);
        return result;
      };
    }

    if(typeof selectTransitItinerary==='function'){
      const baseSelectTransit=selectTransitItinerary;
      selectTransitItinerary=async function(index){
        const result=await baseSelectTransit.apply(this,arguments);
        setFeedbackAvailable(true);
        return result;
      };
    }

    if(typeof startGuidance==='function'){
      const baseStartGuidance=startGuidance;
      startGuidance=async function(){
        const wasActive=Boolean(typeof navigationState!=='undefined'&&navigationState.active);
        const result=await baseStartGuidance.apply(this,arguments);
        const isActive=Boolean(typeof navigationState!=='undefined'&&navigationState.active);
        if(!wasActive&&isActive){
          learningState.guidanceStartedAt=Date.now();learningState.arrivalTracked=false;
          track('guidance_started',{...currentJourneySnapshot()});
          closeFeedback();
        }
        return result;
      };
    }

    if(typeof setGuidanceStatus==='function'){
      const baseGuidanceStatus=setGuidanceStatus;
      setGuidanceStatus=function(text,tone){
        const result=baseGuidanceStatus.apply(this,arguments);
        if(String(text).toLowerCase()==='arriving'&&!learningState.arrivalTracked){
          learningState.arrivalTracked=true;
          track('journey_arrived',{...currentJourneySnapshot()});
          promptAfterJourney('arrival');
        }
        return result;
      };
    }

    if(typeof stopGuidance==='function'){
      const baseStopGuidance=stopGuidance;
      stopGuidance=function(){
        const wasActive=Boolean(typeof navigationState!=='undefined'&&navigationState.active);
        const elapsed=learningState.guidanceStartedAt?Date.now()-learningState.guidanceStartedAt:0;
        const result=baseStopGuidance.apply(this,arguments);
        if(wasActive){
          track('guidance_stopped',{elapsed_bucket:core.durationBucket(elapsed/1000),arrived:learningState.arrivalTracked});
          if(!learningState.arrivalTracked&&elapsed>=60000)promptAfterJourney('guidance_stopped');
        }
        return result;
      };
    }
  }

  globalThis.XploreLearning={
    track,
    localAnalyticsEnabled,
    setLocalAnalyticsEnabled,
    sharingEnabled,
    exportLearningData,
    clearLearningData,
    exportPayload:learningExportPayload,
    refreshPrivacyCopy
  };

  function init(){
    if(learningState.initialised)return;
    learningState.initialised=true;
    ensureStyles();ensureUI();installHooks();
    resetJourneyLearning();
    track('app_loaded',{release:'1.0-compatible'});
    refreshPrivacyCopy();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
