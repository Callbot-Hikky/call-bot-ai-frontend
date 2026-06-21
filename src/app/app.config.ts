import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
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
  lucideSearch,
  lucideBell,
  lucideCheck,
  lucideX,
  lucidePlus,
  lucideEllipsis,
  lucideLogOut,
  lucideGrid2x2,
  lucideChartColumn,
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
  lucideSearch,
  lucideBell,
  lucideCheck,
  lucideX,
  lucidePlus,
  lucideEllipsis,
  lucideLogOut,
  lucideGrid2x2,
  lucideChartColumn,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideIcons(ICONS),
  ],
};
