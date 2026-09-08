import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { SessionService } from './session.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login envoie les identifiants sur /auth/login', async () => {
    const promise = firstValueFrom(service.login('a@b.co', 'secret123'));

    const req = http.expectOne((r) => r.url.endsWith('/auth/login'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@b.co', password: 'secret123' });
    req.flush(null);
    await promise;
  });

  it('register envoie les identifiants sur /auth/register', async () => {
    const promise = firstValueFrom(service.register('new@b.co', 'motdepasse8'));

    const req = http.expectOne((r) => r.url.endsWith('/auth/register'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'new@b.co', password: 'motdepasse8' });
    req.flush(null);
    await promise;
  });

  it('logout appelle /auth/logout pour effacer le cookie côté serveur', async () => {
    const promise = firstValueFrom(service.logout());

    const req = http.expectOne((r) => r.url.endsWith('/auth/logout'));
    expect(req.request.method).toBe('POST');
    req.flush(null);
    await promise;
    expect(document.cookie).not.toContain('hk_session=1');
  });

  it("logout efface l'indice de session meme si l'appel back echoue", async () => {
    document.cookie = 'hk_session=1; Path=/';
    const promise = firstValueFrom(service.logout(), { defaultValue: undefined });

    http
      .expectOne((r) => r.url.endsWith('/auth/logout'))
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    await promise;
    expect(document.cookie).not.toContain('hk_session=1');
  });

  it('signOut purge la session locale et renvoie sur /login', async () => {
    const session = TestBed.inject(SessionService);
    const router = TestBed.inject(Router);
    const clear = vi.spyOn(session, 'clear');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const promise = service.signOut();
    http.expectOne((r) => r.url.endsWith('/auth/logout')).flush(null);
    await promise;

    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
