(function () {
  const USER_STORAGE_KEY = "nak2User";

  window.currentUser = null;

  function loadSavedUser() {
    try {
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      window.currentUser = saved ? JSON.parse(saved) : null;
    } catch {
      window.currentUser = null;
    }
  }

  function saveUser(user) {
    window.currentUser = user;
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_STORAGE_KEY);
    window.updateAuthUI?.();
  }

  window.isAdmin = function (user) {
    return !!(user && window.NAK2_ADMIN_EMAILS?.includes(user.email));
  };

  window.getFirebaseDatabase = function () {
    if (!window.firebase || !window.NAK2_FIREBASE_CONFIG) return null;
    if (!firebase.apps.length) firebase.initializeApp(window.NAK2_FIREBASE_CONFIG);
    return firebase.database();
  };

  window.loginWithGoogle = async function () {
    if (!window.firebase?.auth) {
      alert("Firebase Auth is not available yet. Please refresh and try again.");
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(window.NAK2_FIREBASE_CONFIG);
      const provider = new firebase.auth.GoogleAuthProvider();
      const userCredential = await firebase.auth().signInWithPopup(provider);
      const firebaseUser = userCredential.user;
      const user = {
        name: firebaseUser.displayName,
        email: firebaseUser.email,
        picture: firebaseUser.photoURL
      };
      saveUser(user);
      window.dispatchEvent(new CustomEvent("nak2-auth-changed", { detail: user }));
    } catch (err) {
      console.warn("Google sign-in failed", err);
      alert("Google sign-in failed. Check that Google is enabled in Firebase Authentication.");
    }
  };

  window.logout = async function () {
    try {
      await window.firebase?.auth?.().signOut();
    } catch {
      // Local logout is still useful if Firebase is unavailable.
    }
    try {
      window.google?.accounts?.id?.disableAutoSelect();
    } catch {
      // Google script may not be loaded yet.
    }
    saveUser(null);
    window.dispatchEvent(new CustomEvent("nak2-auth-changed", { detail: null }));
  };

  window.updateAuthUI = function () {
    const hasUser = !!window.currentUser;
    const isAdminUser = window.isAdmin(window.currentUser);
    const signInDiv = document.getElementById("googleSignInButton");
    const userInfo = document.getElementById("userInfo");
    const userPhoto = document.getElementById("userPhoto");
    const userName = document.getElementById("userName");
    const logoutBtn = document.getElementById("logoutBtn");
    const adminBtn = document.getElementById("adminBtn");

    if (userInfo) userInfo.classList.toggle("hidden", !hasUser);
    if (logoutBtn) logoutBtn.classList.toggle("hidden", !hasUser);
    if (adminBtn) adminBtn.classList.toggle("hidden", !isAdminUser);
    if (userPhoto && window.currentUser?.picture) userPhoto.src = window.currentUser.picture;
    if (userName) userName.textContent = window.currentUser?.name || window.currentUser?.email || "";

    if (signInDiv) {
      signInDiv.classList.toggle("hidden", hasUser);
      if (!hasUser) {
        signInDiv.innerHTML = "";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "px-4 py-2 rounded-lg bg-white text-zinc-900 hover:bg-zinc-200 text-sm font-medium";
        button.textContent = "Sign in with Google";
        button.addEventListener("click", window.loginWithGoogle);
        signInDiv.appendChild(button);
      }
    }
  };

  function initFirebaseAuth() {
    if (!window.firebase?.auth) {
      setTimeout(initFirebaseAuth, 100);
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(window.NAK2_FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        saveUser({
          name: user.displayName,
          email: user.email,
          picture: user.photoURL
        });
      } else {
        saveUser(null);
      }
      window.dispatchEvent(new CustomEvent("nak2-auth-changed", { detail: window.currentUser }));
    });
    window.updateAuthUI?.();
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSavedUser();
    window.getFirebaseDatabase?.();
    initFirebaseAuth();
    document.getElementById("logoutBtn")?.addEventListener("click", window.logout);
    document.getElementById("adminBtn")?.addEventListener("click", () => {
      window.location.href = "admin.html";
    });
  });
})();
