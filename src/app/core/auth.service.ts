import { Injectable, computed, signal } from '@angular/core';

/**
 * Login 100% local: los usuarios viven en el localStorage de este navegador.
 * La contraseña nunca se guarda; solo un hash PBKDF2 con sal aleatoria.
 */
export interface LocalUser {
  id: string;
  username: string;
  displayName: string;
  salt: string;
  hash: string;
  createdAt: string;
}

const USERS_KEY = 'inv.users';
const SESSION_KEY = 'inv.session';
const ITERATIONS = 210_000;

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return toB64(bits);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<LocalUser | null>(this.restoreSession());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);

  hasAnyUser(): boolean {
    return this.users().length > 0;
  }

  async register(username: string, displayName: string, password: string): Promise<void> {
    const name = username.trim().toLowerCase();
    if (name.length < 3) throw new Error('El usuario debe tener al menos 3 caracteres.');
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    const users = this.users();
    if (users.some((u) => u.username === name)) throw new Error('Ese usuario ya existe en este dispositivo.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user: LocalUser = {
      id: crypto.randomUUID(),
      username: name,
      displayName: displayName.trim() || username.trim(),
      salt: toB64(salt),
      hash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
    this.startSession(user, true);
  }

  async login(username: string, password: string, remember: boolean): Promise<void> {
    const user = this.users().find((u) => u.username === username.trim().toLowerCase());
    if (!user) throw new Error('Usuario o contraseña incorrectos.');
    const hash = await hashPassword(password, fromB64(user.salt));
    if (hash !== user.hash) throw new Error('Usuario o contraseña incorrectos.');
    this.startSession(user, remember);
  }

  async changePassword(current: string, next: string): Promise<void> {
    const user = this._user();
    if (!user) return;
    if ((await hashPassword(current, fromB64(user.salt))) !== user.hash) throw new Error('La contraseña actual no es correcta.');
    if (next.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const updated = { ...user, salt: toB64(salt), hash: await hashPassword(next, salt) };
    localStorage.setItem(USERS_KEY, JSON.stringify(this.users().map((u) => (u.id === user.id ? updated : u))));
    this._user.set(updated);
  }

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    this._user.set(null);
  }

  deleteAccount(): void {
    const user = this._user();
    if (!user) return;
    localStorage.setItem(USERS_KEY, JSON.stringify(this.users().filter((u) => u.id !== user.id)));
    localStorage.removeItem(`inv.data.${user.id}`);
    this.logout();
  }

  private startSession(user: LocalUser, remember: boolean): void {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, user.id);
    this._user.set(user);
  }

  private restoreSession(): LocalUser | null {
    const id = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    return id ? (this.users().find((u) => u.id === id) ?? null) : null;
  }

  private users(): LocalUser[] {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as LocalUser[];
    } catch {
      return [];
    }
  }
}
