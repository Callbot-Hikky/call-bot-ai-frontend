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

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <hk-header />
        <main
          class="to-background flex-1 overflow-auto bg-gradient-to-b from-green-50/40 p-4 sm:p-6 lg:p-8"
        >
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
