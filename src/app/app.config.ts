import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { AppTitleStrategy } from '@core/layout/app-title.strategy';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { SessionService } from '@core/services/session.service';
import {
  lucideLayoutDashboard,
  lucideCalendar,
  lucideCalendarCheck,
  lucidePhone,
  lucidePhoneCall,
  lucideHourglass,
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
  lucideCircleX,
  lucideX,
  lucidePlus,
  lucideMinus,
  lucideEllipsis,
  lucideLogOut,
  lucideGrid2x2,
  lucideStore,
  lucideChartColumn,
  lucideMenu,
  lucideInfo,
  lucideUnlink,
  lucideList,
  lucideLayoutGrid,
  lucidePencil,
  lucideUndo2,
  lucideRedo2,
  lucideRows3,
  lucideCopy,
  lucideTrash2,
  lucideAlignHorizontalJustifyCenter,
  lucideDownload,
  lucideMaximize,
  lucideUpload,
  lucideBox,
  lucideSave,
  lucideLeaf,
  lucideWrench,
  lucideCreditCard,
  lucideRefreshCw,
  lucideUserX,
  lucideFileText,
  lucideImage,
  lucideExternalLink,
  lucideTriangleAlert,
  lucideBookOpen,
} from '@ng-icons/lucide';

import { environment } from '@env/environment';
import { MENU_GATEWAY } from '@core/services/menu-gateway';
import { HttpMenuGateway } from '@core/services/http-menu-gateway';
import { InMemoryMenuGateway } from '@core/services/in-memory-menu-gateway';
import { routes } from './app.routes';

registerLocaleData(localeFr);

// Icônes Lucide utilisées dans l'app, enregistrées une fois pour toutes.
const ICONS = {
  lucideLayoutDashboard,
  lucideCalendar,
  lucideCalendarCheck,
  lucidePhone,
  lucidePhoneCall,
  lucideHourglass,
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
  lucideCircleX,
  lucideX,
  lucidePlus,
  lucideMinus,
  lucideEllipsis,
  lucideLogOut,
  lucideGrid2x2,
  lucideStore,
  lucideChartColumn,
  lucideMenu,
  lucideInfo,
  lucideUnlink,
  lucideList,
  lucideLayoutGrid,
  lucidePencil,
  lucideUndo2,
  lucideRedo2,
  lucideRows3,
  lucideCopy,
  lucideTrash2,
  lucideAlignHorizontalJustifyCenter,
  lucideDownload,
  lucideMaximize,
  lucideUpload,
  lucideBox,
  lucideSave,
  lucideLeaf,
  lucideWrench,
  lucideCreditCard,
  lucideRefreshCw,
  lucideUserX,
  lucideFileText,
  lucideImage,
  lucideExternalLink,
  lucideTriangleAlert,
  lucideBookOpen,
};

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'fr' },
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideHttpClient(withFetch()),
    provideIcons(ICONS),
    provideAppInitializer(() => inject(SessionService).refresh()),
    // Le menu parle a une passerelle, pas directement a HttpClient : le faux
    // backend ne vit que dans la configuration de maquette et ne part donc pas
    // dans le paquet de production.
    {
      provide: MENU_GATEWAY,
      useClass: environment.useMock ? InMemoryMenuGateway : HttpMenuGateway,
    },
  ],
};
