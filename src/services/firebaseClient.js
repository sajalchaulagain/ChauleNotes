import { initializeApp, getApps } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as signOutFromFirebase,
  updateProfile,
} from 'firebase/auth';
import { FIREBASE_CONFIG } from '../constants/config';

const app = getApps()[0] || initializeApp(FIREBASE_CONFIG);
export const firebaseAuth = getAuth(app);
const persistenceReady = setPersistence(firebaseAuth, browserLocalPersistence);

export const firebaseSignIn = async (email, password) => {
  await persistenceReady;
  return signInWithEmailAndPassword(firebaseAuth, email, password);
};

export const firebaseRegister = async (email, password, username) => {
  await persistenceReady;
  const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(result.user, { displayName: username });
  return result;
};

export const firebaseResetPassword = async (email) => {
  await persistenceReady;
  return sendPasswordResetEmail(firebaseAuth, email);
};

export const firebaseSignOut = () => signOutFromFirebase(firebaseAuth);
