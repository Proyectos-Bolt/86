import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAKmov65RyCUPvvQU86_tIjRQeGQTchF3A",
  authDomain: "taximetro-a1014.firebaseapp.com",
  projectId: "taximetro-a1014",
  storageBucket: "taximetro-a1014.firebasestorage.app",
  messagingSenderId: "496806402421",
  appId: "1:496806402421:web:3795360104d3f040f55b3c",
  measurementId: "G-WF0JHFK64L"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, analytics, auth, db, googleProvider };
