import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HkSidebar } from '@shared/components/organisms/sidebar/hk-sidebar';
import { HkHeader } from '@shared/components/organisms/header/hk-header';
import { HkToaster } from '@shared/components/molecules/toast/hk-toaster';

// Coquille de l'application : sidebar + header + zone de contenu scrollable.
@Component({
  selector: 'hk-app-shell',
  imports: [RouterOutlet, HkSidebar, HkHeader, HkToaster],
  template: `
    <div class="bg-background flex h-screen overflow-hidden">
      <div class="hidden lg:block">
        <hk-sidebar />
      </div>

      <div class="flex min-w-0 flex-1 flex-col">
        <hk-header />
        <main class="flex-1 overflow-auto p-8">
          <div class="mx-auto max-w-[1440px]">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>

    <hk-toaster />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {}
