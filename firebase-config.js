import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWxT2PO8dksz_4DdbTqH5ucjKz9W6w4Oo",
  authDomain: "udhaar-ktkstore.firebaseapp.com",
  projectId: "udhaar-ktkstore",
  storageBucket: "udhaar-ktkstore.firebasestorage.app",
  messagingSenderId: "1096603737191",
  appId: "1:1096603737191:web:3f1c9fc0ca1b1d2ff088c2"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
