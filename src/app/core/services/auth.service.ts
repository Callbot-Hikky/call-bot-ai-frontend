import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@env/environment';

// Cookie "indice de session" partage avec la landing hikyy (Domain=.hikyy.fr).
// Il ne contient PAS de token : le JWT reste dans le cookie HttpOnly pose par
// le back, illisible en JS. Celui-ci est juste un drapeau "il y a une session"
// que la landing statique peut lire pour rediriger vers l'app.
// A aligner sur la duree de vie du cookie de session du back.
const SESSION_HINT_COOKIE = 'hk_session';
const SESSION_HINT_MAX_AGE_SECONDS = 60 * 60 * 24;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth`;

  login(email: string, password: string): Observable<void> {
    return this.http
      .post<void>(`${this.base}/login`, { email, password })
      .pipe(tap(() => this.setSessionHint()));
  }

  register(email: string, password: string): Observable<void> {
    return this.http
      .post<void>(`${this.base}/register`, { email, password })
      .pipe(tap(() => this.setSessionHint()));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, {}).pipe(tap(() => this.clearSessionHint()));
  }

  private setSessionHint(): void {
    document.cookie = this.buildSessionHint('1', SESSION_HINT_MAX_AGE_SECONDS);
  }

  private clearSessionHint(): void {
    document.cookie = this.buildSessionHint('0', 0);
  }

  private buildSessionHint(value: string, maxAgeSeconds: number): string {
    // Prod (*.hikyy.fr) : cookie partage sur le domaine parent.
    // Dev (localhost) : cookie host-only, partage entre ports (4200 <-> 4321).
    const isProd = location.hostname.endsWith('hikyy.fr');
    const domain = isProd ? '; Domain=.hikyy.fr' : '';
    const secure = location.protocol === 'https:' ? '; Secure' : '';

    return `${SESSION_HINT_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${domain}${secure}`;
  }
}
