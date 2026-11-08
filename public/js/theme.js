// Runs before first paint (loaded synchronously in <head>) so there is no light flash.
(function () {
  var t = null;
  try { t = localStorage.getItem('prxy.theme'); } catch (e) { /* storage blocked */ }
  if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light';
})();
