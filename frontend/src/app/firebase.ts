import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

declare global {
  interface Window {
    CHAVEIRO_CONFIG?: {
      firebase?: FirebaseWebConfig;
    };
  }
}

export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
}

const defaultConfig: FirebaseWebConfig = {
  apiKey: 'AIzaSyAq8a3SsVBOqp8jp1pOx7lRL2HFqxpef0A',
  authDomain: 'chaveiro-ifbaps.firebaseapp.com',
  projectId: 'chaveiro-ifbaps',
  appId: '1:808667242872:web:b75fb93ba948397a96688d',
  storageBucket: 'chaveiro-ifbaps.firebasestorage.app',
  messagingSenderId: '808667242872',
};

export const firebaseWebConfig = window.CHAVEIRO_CONFIG?.firebase ?? defaultConfig;
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig);
export const firebaseAuth = getAuth(firebaseApp);
