import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '@core/services/token.service';

// Ajoute l'en-tête Authorization: Bearer <token> quand un token est présent.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenService).token();
  if (token) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};
