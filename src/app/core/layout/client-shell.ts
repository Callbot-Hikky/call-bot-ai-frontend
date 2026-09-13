import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// Coquille des pages client (mobile d'abord). Le bas garde une marge large :
// sur mobile, la barre d'outils du navigateur (Safari) recouvre le bas de page
// tant qu'on n'a pas fini de defiler, et les boutons du pied de page doivent
// rester atteignables sans lutter avec elle.
@Component({
  selector: 'app-client-shell',
  imports: [RouterOutlet],
  template: `
    <div class="bg-background flex h-screen overflow-hidden">
      <div class="flex min-w-0 flex-1 flex-col">
        <main
          class="to-background from-brand-50/40 relative flex-1 overflow-auto bg-gradient-to-b p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8"
        >
          <div class="mx-auto max-w-[1440px]">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class ClientShell {}
