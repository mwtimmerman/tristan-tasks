import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDI919JYmcPBoYuBtBaIvZp_LQPgq3-uSg",
  authDomain: "tristan-f70dc.firebaseapp.com",
  projectId: "tristan-f70dc",
  storageBucket: "tristan-f70dc.firebasestorage.app",
  messagingSenderId: "935746721476",
  appId: "1:935746721476:web:81e050b5316dc01ea6db91"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
