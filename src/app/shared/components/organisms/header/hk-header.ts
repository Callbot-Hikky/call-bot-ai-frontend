import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, map } from 'rxjs';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { HkMobileNav } from '@shared/components/organisms/mobile-nav/hk-mobile-nav';
import { HkCommandPalette } from '@shared/components/organisms/command-palette/hk-command-palette';
import { AuthService } from '@core/services/auth.service';
import { SessionService } from '@core/services/session.service';

// Header sticky : drawer mobile (< lg), titre dérivé de la route, notifications.
@Component({
  selector: 'hk-header',
  imports: [HkIconButton, HkMobileNav, HkCommandPalette],
  template: `
    <header
      class="bg-background border-border sticky top-0 flex h-14 items-center gap-3 border-b px-4"
      style="z-index: var(--z-sticky-header)"
    >
      <span class="lg:hidden">
        <hk-mobile-nav />
      </span>
      <h1 class="text-text-strong truncate text-base font-semibold">{{ title() }}</h1>
      <div class="flex-1"></div>
      <hk-command-palette />
      <div class="relative">
        <hk-icon-button icon="lucideBell" label="Notifications" />
        <span class="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full"></span>
      </div>
      <hk-icon-button icon="lucideLogOut" label="Se déconnecter" (click)="logout()" />
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkHeader {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);

  protected async logout(): Promise<void> {
    await firstValueFrom(this.auth.logout()).catch(() => undefined);
    this.session.clear();
    await this.router.navigateByUrl('/login');
  }

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
