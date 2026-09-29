/* ============================================================================
   UTILS MODULE  (utils.js)
   ============================================================================ */
const Utils = (function(){
  function uid(){
    return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }
  function formatETB(amount, hide){
    if(hide) return "••••••••";
    const n = Number(amount)||0;
    return n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function formatCompactETB(amount){
    const n = Number(amount)||0;
    return "ETB " + n.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  }
  function formatDateTime(iso){
    if(!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + " · " + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }
  function debounce(fn, wait){
    let t;
    return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), wait); };
  }
  function sourceIcon(source){
    const map = {
      Salary:'work', Freelance:'computer', Business:'store', Gift:'card_giftcard',
      Investment:'trending_up', Commission:'monetization_on', Bonus:'redeem',
      Allowance:'savings', Other:'payments'
    };
    return map[source] || 'payments';
  }
  return { uid, formatETB, formatCompactETB, formatDateTime, debounce, sourceIcon };
})();
