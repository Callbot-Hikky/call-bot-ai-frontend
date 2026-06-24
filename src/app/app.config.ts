import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@env/environment';
import {
  lucideLayoutDashboard,
  lucideCalendar,
  lucideCalendarCheck,
  lucidePhone,
  lucidePhoneCall,
  lucideUsers,
  lucideUtensilsCrossed,
  lucideSettings,
  lucideChevronLeft,
  lucideChevronRight,
  lucideChevronDown,
  lucideChevronUp,
  lucideSearch,
  lucideBell,
  lucideCheck,
  lucideCircleCheck,
  lucideX,
  lucidePlus,
  lucideEllipsis,
  lucideLogOut,
  lucideGrid2x2,
  lucideChartColumn,
  lucideMenu,
} from '@ng-icons/lucide';

import { routes } from './app.routes';

// Icônes Lucide utilisées dans l'app, enregistrées une fois pour toutes.
const ICONS = {
  lucideLayoutDashboard,
  lucideCalendar,
  lucideCalendarCheck,
  lucidePhone,
  lucidePhoneCall,
  lucideUsers,
  lucideUtensilsCrossed,
  lucideSettings,
  lucideChevronLeft,
  lucideChevronRight,
  lucideChevronDown,
  lucideChevronUp,
  lucideSearch,
  lucideBell,
  lucideCheck,
  lucideCircleCheck,
  lucideX,
  lucidePlus,
  lucideEllipsis,
  lucideLogOut,
  lucideGrid2x2,
  lucideChartColumn,
  lucideMenu,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideIcons(ICONS),
    // Dev uniquement : récupère un token JWT au démarrage (auth réelle gérée ailleurs).
    provideAppInitializer(() => {
      const creds = environment.devAuth;
      if (environment.useMock || !creds) {
        return;
      }
      const auth = inject(AuthService);
      return firstValueFrom(auth.login(creds.email, creds.password)).catch(() => undefined);
    }),
  ],
};
