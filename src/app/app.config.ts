import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
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
  lucideChevronUp,
  lucideSearch,
  lucideBell,
  lucideCheck,
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
    provideHttpClient(withFetch()),
    provideIcons(ICONS),
  ],
};
