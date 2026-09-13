import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// En-tete commun des pages client (carte, reservation, replanification) : un surtitre qui dit
// ou l'on est, le nom du restaurant en grand, un trait de la couleur de marque. Meme identite
// visuelle d'une page a l'autre, le client sait qu'il est toujours chez le meme restaurant.
@Component({
  selector: 'hk-client-header',
  template: `
    <header class="reveal flex flex-col gap-3">
      <p class="text-primary text-xs font-medium tracking-[0.18em] uppercase">{{ eyebrow() }}</p>
      <h1 class="text-text-strong text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {{ title() }}
      </h1>
      <div class="bg-primary h-0.5 w-12"></div>
      <ng-content />
    </header>
  `,
  styles: `
    .reveal {
      animation: reveal 480ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    @keyframes reveal {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .reveal {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkClientHeader {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
}
