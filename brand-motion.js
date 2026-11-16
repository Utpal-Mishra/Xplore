/* Lightweight conceptual route-decision animation.
   No telemetry, geolocation access, route mutation, third-party assets or persistence. */
(() => {
  "use strict";
  const panel = document.getElementById("decisionMotion");
  if (!panel) return;
  const tracks = Array.from(panel.querySelectorAll("[data-signal-path]"));
  const dots = Array.from(panel.querySelectorAll(".signal-particle"));
  const score = document.getElementById("routeScore");
  const stateLabel = document.getElementById("decisionMotionState");
  if (tracks.length !== 4 || dots.length !== 4) return;

  const media = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => Boolean(media && media.matches);
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection && connection.saveData);
  const lengths = tracks.map(path => path.getTotalLength());
  const periods = [5.5, 6.3, 6.9, 7.7];
  const phases = [0, 0.22, 0.48, 0.71];
  let visible = true;
  let animationFrame = null;

  function place(index, fraction) {
    const p = tracks[index].getPointAtLength(lengths[index] * fraction);
    dots[index].setAttribute("cx", p.x.toFixed(2));
    dots[index].setAttribute("cy", p.y.toFixed(2));
  }
  function updateRouteState() {
    const value = (score?.textContent || "").trim();
    const selected = /^\d+(?:\.\d+)?(?:\s*\/\s*100)?$/.test(value);
    panel.dataset.scored = String(selected);
    if (stateLabel) stateLabel.textContent = selected ? "Route scored" : "Ready for inputs";
  }
  function draw(time) {
    animationFrame = null;
    const seconds = time / 1000;
    for (let i = 0; i < tracks.length; i++) {
      place(i, (seconds / periods[i] + phases[i]) % 1);
    }
    animationFrame = requestAnimationFrame(draw);
  }
  function sync() {
    const shouldRun = !document.hidden && visible && !reduced() && !saveData;
    if (!shouldRun) {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      for (let i = 0; i < tracks.length; i++) place(i, 0.72);
      return;
    }
    if (animationFrame === null) animationFrame = requestAnimationFrame(draw);
  }

  updateRouteState();
  if (score && typeof MutationObserver !== "undefined") {
    new MutationObserver(updateRouteState).observe(score, {childList:true, characterData:true, subtree:true});
  }
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
      sync();
    }, {threshold:0.01});
    observer.observe(panel);
  }
  document.addEventListener("visibilitychange", sync);
  if (media?.addEventListener) media.addEventListener("change", sync);
  else if (media?.addListener) media.addListener(sync);
  if (connection?.addEventListener) connection.addEventListener("change", sync);
  sync();
})();
