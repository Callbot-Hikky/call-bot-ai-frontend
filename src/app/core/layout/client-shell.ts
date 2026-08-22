import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-client-shell',
  imports: [RouterOutlet],
  template: `
    <div class="bg-background flex h-screen overflow-hidden">
      <div class="flex min-w-0 flex-1 flex-col">
        <main
          class="to-background flex-1 overflow-auto bg-gradient-to-b from-green-50/40 p-4 sm:p-6 lg:p-8"
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
