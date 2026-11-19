/* Route-specific Decision Intelligence for XPLORE.
   Uses existing route candidates, scoring components and preference weights.
   No added requests, location tracking, storage, or fabricated metrics. */
(function () {
  'use strict';

  const $insight = id => document.getElementById(id);
  const names = {
    time:'Time',
    carbon:'Carbon',
    health:'Health / activity',
    comfort:'Comfort',
    confidence:'Confidence'
  };
  const safeNumber = value => typeof value === 'number' && Number.isFinite(value);
  const rounded = value => Math.round(value);
  const oneDecimal = value => (Math.round(value * 10) / 10).toFixed(1);

  function buildRouteDecisionInsight(route, selectedIndex) {
    const candidates = state.enrichedRoutes || [];
    const raw = route && route.raw;
    if (!raw || !safeNumber(raw.duration) || !safeNumber(route.score) ||
        !safeNumber(route.carbon) || !safeNumber(route.confidence) ||
        !candidates.length || !Array.isArray(state.routes) || !state.routes.length) return null;

    const weights = scoreWeights();
    const components = scoreComponents(raw, route.providerIndex);
    const priorityKey = Object.keys(names)
      .filter(key => safeNumber(weights[key]) && safeNumber(components[key]))
      .sort((a,b) => weights[b] - weights[a])[0];
    if (!priorityKey) return null;

    const validDurations = candidates.map(candidate => candidate.raw && candidate.raw.duration).filter(safeNumber);
    const validEmissions = candidates.map(candidate => candidate.carbon).filter(safeNumber);
    if (!validDurations.length || !validEmissions.length) return null;

    const moreThanOne = candidates.length > 1;
    const timeDelta = raw.duration - Math.min(...validDurations);
    const carbonDelta = Math.max(0, route.carbon - Math.min(...validEmissions));
    const timeComparison = !moreThanOne ? 'Only route available'
      : timeDelta < 30 ? 'Fastest candidate'
      : '+' + Math.max(1, rounded(timeDelta/60)) + ' min vs fastest';
    const carbonComparison = !moreThanOne ? 'Only route available'
      : carbonDelta < 1 ? 'Lowest estimated CO₂'
      : '+' + rounded(carbonDelta) + ' g vs lowest';

    const weight = weights[priorityKey];
    const component = components[priorityKey];
    const confidence = rounded(route.confidence);
    const currentWeather = state.lastContext && state.lastContext.weather;
    const currentAir = state.lastContext && state.lastContext.air;
    const contextText = (currentWeather
      ? 'Weather informs the pilot comfort estimate.'
      : 'Weather unavailable: comfort uses a pilot default.')
      + ' ' + (currentAir
        ? 'Air quality is displayed separately, not included in scoring.'
        : 'Air quality unavailable and not included in scoring.');

    return {
      heading: selectedIndex === 0 ? 'XPLORE recommended route' : 'Alternative route ' + selectedIndex,
      score: rounded(route.score) + '/100',
      status: selectedIndex === 0 ? 'Recommended route' : 'Alternative selected',
      priority: state.preference + ' preference · ' + state.mode + ' · ' + candidates.length +
        ' route' + (candidates.length === 1 ? '' : 's') + ' compared · ' + confidence + '% confidence',
      timeComparison,
      carbonComparison,
      driverLabel: names[priorityKey] + ' · priority factor',
      driverWeight: rounded(weight * 100) + '% weight · ' + rounded(component) + '/100',
      driverValue: Math.max(0,Math.min(100,component)),
      driverDetail: names[priorityKey] + ' contributes approximately ' +
        oneDecimal(component * weight) + ' points to this route’s ' +
        rounded(route.score) + '/100 score.',
      contextText
    };
  }

  function resetRouteDecisionInsight() {
    const panel = $insight('decisionInsight');
    if (!panel) return;
    const empty = $insight('decisionInsightEmpty');
    const body = $insight('decisionInsightBody');
    if (empty) empty.hidden = false;
    if (body) body.hidden = true;
    const status = $insight('decisionInsightStatus');
    if (status) status.textContent = 'Awaiting route';
    panel.removeAttribute('data-selected-route');
  }

  function renderRouteDecisionInsight(route,index) {
    const panel = $insight('decisionInsight');
    if (!panel) return;
    const model = buildRouteDecisionInsight(route,index);
    if (!model) {resetRouteDecisionInsight();return;}

    const bindings = {
      decisionInsightStatus:model.status,
      decisionInsightHeading:model.heading,
      decisionInsightScore:model.score,
      decisionInsightPriority:model.priority,
      decisionInsightTime:model.timeComparison,
      decisionInsightCarbon:model.carbonComparison,
      decisionInsightDriverLabel:model.driverLabel,
      decisionInsightDriverWeight:model.driverWeight,
      decisionInsightDriverDetail:model.driverDetail,
      decisionInsightContext:model.contextText
    };
    Object.entries(bindings).forEach(([id,value])=>{
      const element=$insight(id);
      if(element)element.textContent=value;
    });
    const fill=$insight('decisionInsightDriverFill');
    if(fill)fill.style.width=model.driverValue.toFixed(1)+'%';

    const empty=$insight('decisionInsightEmpty');
    const body=$insight('decisionInsightBody');
    if(empty)empty.hidden=true;
    if(body)body.hidden=false;
    panel.setAttribute('data-selected-route',String(index));
  }

  window.buildRouteDecisionInsight=buildRouteDecisionInsight;
  window.renderRouteDecisionInsight=renderRouteDecisionInsight;
  window.resetRouteDecisionInsight=resetRouteDecisionInsight;
})();