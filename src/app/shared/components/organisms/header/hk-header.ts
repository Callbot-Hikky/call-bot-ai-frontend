import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { LayoutService } from '@core/services/layout.service';

// Header sticky : bouton menu (mobile), titre dérivé de la route, notifications.
@Component({
  selector: 'hk-header',
  imports: [HkIconButton],
  template: `
    <header
      class="bg-background border-border sticky top-0 flex h-14 items-center gap-3 border-b px-4"
      style="z-index: var(--z-sticky-header)"
    >
      <span class="lg:hidden">
        <hk-icon-button
          icon="lucideMenu"
          label="Ouvrir le menu"
          (click)="layout.openMobileDrawer()"
        />
      </span>
      <h1 class="text-text-strong text-base font-semibold">{{ title() }}</h1>
      <div class="flex-1"></div>
      <div class="relative">
        <hk-icon-button icon="lucideBell" label="Notifications" />
        <span class="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full"></span>
      </div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkHeader {
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly title = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.deepestTitle()),
    ),
    { initialValue: this.deepestTitle() },
  );

  private deepestTitle(): string {
    let r: ActivatedRoute | null = this.route.root;
    let title = '';
    while (r) {
      const value = r.snapshot?.data?.['title'];
      if (typeof value === 'string') {
        title = value;
      }
      r = r.firstChild;
    }
    return title;
  }
}
