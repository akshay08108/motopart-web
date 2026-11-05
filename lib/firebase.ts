import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const useEmulators = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";

const firebaseConfig = {
  apiKey: "AIzaSyDl38pRlgpMCqaeKe5gSj8263FSGS9z-UQ",
  authDomain: "partx-production.firebaseapp.com",
  projectId: useEmulators ? "demo-partx-rider-ui" : "partx-production",
  storageBucket: "partx-production.firebasestorage.app",
  messagingSenderId: "536857278497",
  appId: "1:536857278497:web:8ba54cf1ee68a7a96c0b60",
  measurementId: "G-1CH07SRZRB",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

// Explicit development-only opt-in. Production builds always use the live project.
const emulatorApp = firebaseApp as typeof firebaseApp & { partxEmulatorsConnected?: boolean };
if (useEmulators && !emulatorApp.partxEmulatorsConnected) {
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8082);
  connectFunctionsEmulator(getFunctions(firebaseApp, "asia-south1"), "127.0.0.1", 5001);
  emulatorApp.partxEmulatorsConnected = true;
}
