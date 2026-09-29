/* ============================================================================
   ANIMATIONS MODULE  (animations.js)
   ============================================================================ */
const Anim = (function(){
  let enabled = true;
  function setEnabled(v){
    enabled = v;
    document.body.classList.toggle('no-anim', !v);
  }
  function countUp(el, from, to, duration){
    if(!enabled){ el.textContent = to.toFixed(2); return; }
    duration = duration || 600;
    const start = performance.now();
    function frame(now){
      const p = Math.min(1, (now-start)/duration);
      const eased = 1 - Math.pow(1-p, 3);
      const val = from + (to-from)*eased;
      el.textContent = val.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
      if(p<1) requestAnimationFrame(frame);
      else el.textContent = to.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
    }
    requestAnimationFrame(frame);
  }
  function ripple(e, target){
    if(!enabled) return;
    const rect = target.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'ripple-el';
    span.style.width = span.style.height = d+'px';
    const x = (e.clientX ?? (rect.left+rect.width/2)) - rect.left - d/2;
    const y = (e.clientY ?? (rect.top+rect.height/2)) - rect.top - d/2;
    span.style.left = x+'px'; span.style.top = y+'px';
    target.appendChild(span);
    setTimeout(()=>span.remove(), 600);
  }
  return { setEnabled, isEnabled: ()=>enabled, countUp, ripple };
})();
