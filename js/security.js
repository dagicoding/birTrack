/* ============================================================================
   SECURITY MODULE  (security.js)
   PIN lock + local (email-free) recovery question, hashed with SHA-256 and a
   random per-account salt via SubtleCrypto — never stored in plain text.

   The record now lives in Firestore (users/{uid}/meta/security) instead of
   localStorage. Because a couple of call sites need the current state
   synchronously (e.g. rendering the recovery question), `init()` loads it
   once at startup and every mutation keeps the in-memory cache and the
   Firestore doc in lockstep.
   ============================================================================ */
const Security = (function(){
  const EMPTY = { enabled:false, salt:null, pinHash:null, question:null, answerHash:null };

  const QUESTIONS = [
    "What was the name of your first pet?",
    "What is your mother's maiden name?",
    "What city were you born in?",
    "What was your childhood nickname?",
    "What is your favorite food?"
  ];

  let cached = EMPTY;

  function init(){
    return DB.getSecurity().then(data=>{ cached = data || EMPTY; return cached; });
  }
  function get(){ return cached; }
  function save(data){
    cached = data;
    return DB.saveSecurity(data).then(()=>data);
  }
  function randomSalt(){
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function hash(value, salt){
    const enc = new TextEncoder().encode(salt + ':' + value);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function setupPin(pin, question, answer){
    const salt = randomSalt();
    const pinHash = await hash(pin, salt);
    const answerHash = await hash(answer.trim().toLowerCase(), salt);
    return save({ enabled:true, salt, pinHash, question, answerHash });
  }
  async function verifyPin(pin){
    const s = get();
    if(!s.salt || !s.pinHash) return false;
    return (await hash(pin, s.salt)) === s.pinHash;
  }
  async function verifyAnswer(answer){
    const s = get();
    if(!s.salt || !s.answerHash) return false;
    return (await hash(answer.trim().toLowerCase(), s.salt)) === s.answerHash;
  }
  async function changePin(newPin){
    const s = get();
    const salt = s.salt || randomSalt();
    const pinHash = await hash(newPin, salt);
    return save(Object.assign({}, s, { enabled:true, salt, pinHash }));
  }
  function disable(){
    return save(Object.assign({}, EMPTY));
  }
  function isEnabled(){ return !!get().enabled; }

  return { QUESTIONS, init, get, setupPin, verifyPin, verifyAnswer, changePin, disable, isEnabled };
})();
