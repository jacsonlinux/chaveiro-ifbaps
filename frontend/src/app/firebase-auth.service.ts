import { Injectable, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

@Injectable({ providedIn: 'root' })
export class FirebaseAuthService {
  readonly user = signal<User | null>(null);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve) => {
      onAuthStateChanged(firebaseAuth, (user) => {
        this.user.set(user);
        resolve();
      });
    });
  }

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(firebaseAuth, provider);
  }

  async signOut(): Promise<void> {
    await signOut(firebaseAuth);
  }
}
