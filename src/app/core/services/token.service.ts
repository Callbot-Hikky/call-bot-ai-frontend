import { Injectable, signal } from '@angular/core';

// Porte le token JWT courant (lu par l'interceptor). L'auth réelle est gérée ailleurs ;
// en dev, AuthService le renseigne via un auto-login.
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly _token = signal<string | null>(null);
  readonly token = this._token.asReadonly();

  set(token: string | null): void {
    this._token.set(token);
  }
}
