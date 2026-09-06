import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth`;

  login(email: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/login`, { email, password });
  }

  register(email: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/register`, { email, password });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, {});
  }
}
