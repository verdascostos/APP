import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBuZqbmua9Q8Kv1g0VwELXo2Si0--HIR44",
  authDomain: "verdascostos.firebaseapp.com",
  projectId: "verdascostos",
  storageBucket: "verdascostos.firebasestorage.app",
  messagingSenderId: "545388088686",
  appId: "1:545388088686:web:3de720e09f6f307e96c57f",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export async function loginAnonimo() {
  return signInAnonymously(auth);
}