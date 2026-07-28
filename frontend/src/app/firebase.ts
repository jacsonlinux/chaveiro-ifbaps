import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

declare global {
  interface Window {
    KEYCHAIN_CONFIG?: {
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
  apiKey: 'AIzaSyBR2oRktnqQbM4moKJ7znzxP7dqzyPxkBg',
  authDomain: 'keychain-ifbaps.firebaseapp.com',
  projectId: 'keychain-ifbaps',
  appId: '1:456566550339:web:0179e8ef2c5d53b73289f6',
  storageBucket: 'keychain-ifbaps.firebasestorage.app',
  messagingSenderId: '456566550339',
};

export const firebaseWebConfig = window.KEYCHAIN_CONFIG?.firebase ?? defaultConfig;
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig);
export const firebaseAuth = getAuth(firebaseApp);
