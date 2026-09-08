import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { EMPTY, Observable, catchError, finalize, firstValueFrom, tap } from 'rxjs';
import { environment } from '@env/environment';
import { SessionService } from '@core/services/session.service';

// Cookie "indice de session" partage avec la landing Alloquence (Domain=.alloquence.fr).
// Il ne contient PAS de token : le JWT reste dans le cookie HttpOnly pose par
// le back, illisible en JS. Celui-ci est juste un drapeau "il y a une session"
// que la landing statique peut lire pour rediriger vers l'app.
// A aligner sur la duree de vie du cookie de session du back.
const SESSION_HINT_COOKIE = 'hk_session';
const SESSION_HINT_MAX_AGE_SECONDS = 60 * 60 * 24;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
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
    // L'indice de session est efface quoi qu'il arrive : si /auth/logout echoue
    // (reseau, session deja expiree cote back), garder `hk_session` ferait
    // rediriger la landing vers l'app en boucle pour un utilisateur deconnecte.
    return this.http.post<void>(`${this.base}/logout`, {}).pipe(
      finalize(() => this.clearSessionHint()),
      catchError(() => EMPTY),
    );
  }

  // Deconnexion complete, point d'entree unique de l'UI : appel back, purge de
  // l'etat local, retour sur /login.
  async signOut(): Promise<void> {
    await firstValueFrom(this.logout(), { defaultValue: undefined });
    this.session.clear();
    await this.router.navigateByUrl('/login');
  }

  private setSessionHint(): void {
    document.cookie = this.buildSessionHint('1', SESSION_HINT_MAX_AGE_SECONDS);
  }

  private clearSessionHint(): void {
    document.cookie = this.buildSessionHint('0', 0);
  }

  private buildSessionHint(value: string, maxAgeSeconds: number): string {
    // Prod (*.alloquence.fr) : cookie partage sur le domaine parent.
    // Dev (localhost) : cookie host-only, partage entre ports (4200 <-> 4321).
    const isProd = location.hostname.endsWith('alloquence.fr');
    const domain = isProd ? '; Domain=.alloquence.fr' : '';
    const secure = location.protocol === 'https:' ? '; Secure' : '';

    return `${SESSION_HINT_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${domain}${secure}`;
  }
}
