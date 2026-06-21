import { Injectable, signal } from '@angular/core';

// État du shell en mémoire de session (signals). Pas de localStorage (cf. conventions).
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly sidebarCollapsed = signal(false);
  readonly mobileDrawerOpen = signal(false);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  openMobileDrawer(): void {
    this.mobileDrawerOpen.set(true);
  }

  closeMobileDrawer(): void {
    this.mobileDrawerOpen.set(false);
  }
}
