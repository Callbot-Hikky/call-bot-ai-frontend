import { Injectable, signal } from '@angular/core';

// État du shell en mémoire de session (signals). Pas de localStorage (cf. conventions).
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly sidebarCollapsed = signal(false);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }
}
