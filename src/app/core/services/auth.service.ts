import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@env/environment';
import { TokenService } from './token.service';

interface AuthResponse {
  accessToken: string;
  tokenType: string;
}

// Auth minimale : login -> stocke le token. C'est un point d'entrée provisoire
// (l'écran de connexion réel est la partie d'un autre membre de l'équipe).
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((res) => this.tokens.set(res.accessToken)));
  }
}
