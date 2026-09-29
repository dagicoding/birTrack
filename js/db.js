/* ============================================================================
   DATABASE MODULE  (db.js)

   Firestore-backed replacement for the old localStorage Storage + DB facade.
   Keeps the exact same async, Promise-returning shape the rest of the app
   already expects, so app.js barely had to change.

   Data model (per signed-in device/user, see firebase-init.js):
     users/{uid}/records/{recordId}   one doc per income record
     users/{uid}/meta/settings        { theme, balanceHidden, animations }
     users/{uid}/meta/security        { enabled, salt, pinHash, question, answerHash }

   Records are cached in memory and kept fresh via a realtime listener, so
   DB.list() resolves instantly and the app also live-updates if the same
   account is open in another tab or another device.
   ============================================================================ */
const DB = (function(){
  let uid = null;
  let recordsCol = null;
  let metaCol = null;
  let cache = [];
  let unsubscribe = null;
  const changeListeners = [];
  let firstSnapshotResolved;
  const firstSnapshot = new Promise(res=>{ firstSnapshotResolved = res; });

  function notifyChange(){ changeListeners.forEach(fn=>{ try{ fn(cache.slice()); } catch(e){ console.error(e); } }); }

  function init(){
    if(!FirebaseApp.configIsValid){
      return Promise.reject(new Error('firebase-not-configured'));
    }
    return FirebaseApp.ready.then(theUid=>{
      uid = theUid;
      recordsCol = FirebaseApp.db.collection('users').doc(uid).collection('records');
      metaCol = FirebaseApp.db.collection('users').doc(uid).collection('meta');
      return new Promise((resolve, reject)=>{
        unsubscribe = recordsCol.onSnapshot(snap=>{
          cache = snap.docs.map(d=>d.data());
          firstSnapshotResolved();
          notifyChange();
          resolve();
        }, err=>{ console.error('records listener error', err); reject(err); });
      });
    });
  }

  function onChange(fn){ changeListeners.push(fn); }

  function list(){
    return firstSnapshot.then(()=> cache.slice());
  }

  function create(record){
    const idx = cache.findIndex(r=>r.id===record.id);
    if(idx===-1) cache = cache.concat([record]); else cache[idx]=record;
    return recordsCol.doc(record.id).set(record).then(()=>record);
  }

  function update(id, patch){
    const idx = cache.findIndex(r=>r.id===id);
    if(idx===-1) return Promise.resolve(null);
    const updated = Object.assign({}, cache[idx], patch, { updatedAt: new Date().toISOString() });
    cache = cache.slice(); cache[idx] = updated;
    return recordsCol.doc(id).set(updated, { merge:true }).then(()=>updated);
  }

  function remove(id){
    cache = cache.filter(r=>r.id!==id);
    return recordsCol.doc(id).delete();
  }

  function clear(){
    return recordsCol.get().then(snap=>{
      if(snap.empty){ cache = []; return; }
      const batch = FirebaseApp.db.batch();
      snap.docs.forEach(d=>batch.delete(d.ref));
      cache = [];
      return batch.commit();
    });
  }

  function calculateTotal(list){
    return list.reduce((sum,r)=> sum + (Number(r.amount)||0), 0);
  }

  /* ---- Settings & Security: small docs under meta/ ---- */
  function getDoc(name, fallback){
    return metaCol.doc(name).get().then(snap=> snap.exists ? snap.data() : fallback);
  }
  function saveDoc(name, patch){
    return getDoc(name, {}).then(cur=>{
      const next = Object.assign({}, cur, patch);
      return metaCol.doc(name).set(next, { merge:true }).then(()=>next);
    });
  }

  function getSettings(){ return getDoc('settings', {}); }
  function saveSettings(patch){ return saveDoc('settings', patch); }
  function getSecurity(){ return getDoc('security', { enabled:false, salt:null, pinHash:null, question:null, answerHash:null }); }
  function saveSecurity(data){ return metaCol.doc('security').set(data).then(()=>data); }

  return {
    init, onChange, list, create, update, remove, clear, calculateTotal,
    getSettings, saveSettings, getSecurity, saveSecurity,
    get uid(){ return uid; }
  };
})();
