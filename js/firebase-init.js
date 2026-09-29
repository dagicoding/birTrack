/* ============================================================================
   FIREBASE BOOTSTRAP  (firebase-init.js)

   Initializes the Firebase app, signs the device in anonymously (so data is
   private to this browser/device without requiring the user to create an
   account), and turns on Firestore's offline cache so the app keeps working
   offline and syncs automatically once back online — matching the original
   offline-first spirit of the app, now backed by the cloud instead of
   localStorage.

   Exposes `FirebaseApp`:
     FirebaseApp.ready         -> Promise<string uid>, resolves once signed in
     FirebaseApp.db            -> firestore.Firestore instance
     FirebaseApp.configIsValid -> boolean, false if firebase-config.js wasn't
                                   filled in with real project credentials
   ============================================================================ */
const FirebaseApp = (function(){
  const configIsValid = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY' && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.projectId !== 'YOUR_PROJECT_ID');

  let db = null;
  let auth = null;
  let ready = Promise.reject(new Error('Firebase not configured'));
  ready.catch(()=>{ /* app.js checks configIsValid before ever awaiting ready */ });

  if(configIsValid){
    firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();

    // Keep working offline; Firestore syncs queued writes once back online.
    try{
      db.enablePersistence({ synchronizeTabs: true }).catch(()=>{ /* multi-tab or unsupported browser: safe to ignore */ });
    } catch(e){ /* older SDKs throw synchronously if unsupported */ }

    ready = new Promise((resolve, reject)=>{
      auth.onAuthStateChanged(user=>{
        if(user){ resolve(user.uid); }
      }, reject);
      auth.signInAnonymously().catch(reject);
    });
  }

  return { configIsValid, get db(){ return db; }, get auth(){ return auth; }, ready };
})();
