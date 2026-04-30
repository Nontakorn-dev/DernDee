// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// TODO: Add SDKs for Firebase products you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDYwme5Im7ua6ZFPbezIcXCq65iR9OuloA",
  authDomain: "database-42f73.firebaseapp.com",
  projectId: "database-42f73",
  storageBucket: "database-42f73.firebasestorage.app",
  messagingSenderId: "634066457064",
  appId: "1:634066457064:web:93e837f0838b8c3cb4545d",
  measurementId: "G-N5HZHNBERE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export default app;