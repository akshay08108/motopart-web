import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDl38pRlgpMCqaeKe5gSj8263FSGS9z-UQ",
  authDomain: "partx-production.firebaseapp.com",
  projectId: "partx-production",
  storageBucket: "partx-production.firebasestorage.app",
  messagingSenderId: "536857278497",
  appId: "1:536857278497:web:8ba54cf1ee68a7a96c0b60",
  measurementId: "G-1CH07SRZRB",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
