// XPLORE v0.5.0 — keep Transit v1 failures isolated from the rest of navigation.
(function(){
  const wrappedPlanJourney=planJourney;
  planJourney=async function(){
    try{
      return await wrappedPlanJourney();
    }catch(error){
      if(state.mode!=='transit')throw error;
      console.error('XPLORE Transit v1 planning failed.',error);
      const message=error?.message||'Public-transport planning is temporarily unavailable.';
      setStatus(message,true);
      if(typeof transitStatus==='function')transitStatus(message,'error');
      document.body.classList.remove('loading');
      return null;
    }
  };
})();
