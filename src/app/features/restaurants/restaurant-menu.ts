import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkPdfPages } from '@shared/components/molecules/pdf-pages/hk-pdf-pages';
import { MenuService } from '@core/services/menu.service';
import { PublicMenu, formatPrice, isSafePublicFileUrl } from '@core/models/menu.model';

@Component({
  selector: 'app-restaurant-menu',
  imports: [RouterLink, HkIcon, HkSkeleton, HkPdfPages],
  template: `
    <article class="mx-auto flex w-full max-w-2xl flex-col gap-10 py-6">
      @if (loading()) {
        <div class="flex flex-col gap-6" aria-busy="true" aria-label="Chargement de la carte">
          <hk-skeleton height="0.75rem" width="6rem" />
          <hk-skeleton height="2.5rem" width="16rem" />
          <hk-skeleton height="12rem" />
        </div>
      } @else if (error(); as err) {
        <div class="flex flex-col items-center gap-3 py-16 text-center">
          <hk-icon name="lucideUtensilsCrossed" [size]="32" class="text-text-subtle" />
          <p class="text-text-strong text-lg font-semibold">
            {{
              err === 'not_found'
                ? 'Ce restaurant est introuvable.'
                : 'Impossible de charger la carte.'
            }}
          </p>
          @if (err !== 'not_found') {
            <button type="button" class="text-primary text-sm underline" (click)="load()">
              Réessayer
            </button>
          }
        </div>
      } @else if (menu(); as m) {
        <header class="reveal flex flex-col gap-3">
          <p class="text-primary text-xs font-medium tracking-[0.18em] uppercase">La carte</p>
          <h1
            class="text-text-strong text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {{ m.restaurantName }}
          </h1>
          <div class="bg-primary h-0.5 w-12"></div>
        </header>

        @switch (m.mode) {
          @case ('manual') {
            @for (section of m.manual?.sections ?? []; track $index; let s = $index) {
              <section class="reveal flex flex-col gap-4" [style.animation-delay.ms]="80 + s * 60">
                <h2
                  class="text-text-subtle flex items-center gap-3 text-xs font-medium tracking-[0.18em] uppercase"
                >
                  {{ section.name }}
                  <span class="bg-border h-px flex-1"></span>
                </h2>
                <ul class="flex flex-col gap-4">
                  @for (item of section.items; track $index) {
                    <li class="flex flex-col gap-1">
                      <div class="flex items-baseline gap-2">
                        <span class="text-text-strong font-medium">{{ item.name }}</span>
                        @if (item.price) {
                          <span
                            class="border-border mx-1 flex-1 -translate-y-1 border-b border-dotted"
                            aria-hidden="true"
                          ></span>
                          <span class="text-text-strong font-mono text-sm tabular-nums"
                            >{{ price(item.price) }} €</span
                          >
                        }
                      </div>
                      @if (item.description) {
                        <p class="text-text-muted max-w-[60ch] text-sm leading-relaxed">
                          {{ item.description }}
                        </p>
                      }
                    </li>
                  }
                </ul>
              </section>
            }
          }
          @case ('images') {
            <div class="reveal flex flex-col gap-4" [style.animation-delay.ms]="80">
              @for (file of m.files; track file.id; let i = $index) {
                <figure
                  class="bg-card border-border/70 overflow-hidden rounded-lg border shadow-sm"
                >
                  <img
                    data-testid="menu-image"
                    [src]="file.url"
                    [alt]="'Page ' + (i + 1) + ' de la carte de ' + m.restaurantName"
                    class="block w-full"
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              }
            </div>
          }
          @case ('pdf') {
            @if (!pdfFile()) {
              <p class="text-text-muted reveal text-base" [style.animation-delay.ms]="80">
                La carte de {{ m.restaurantName }} arrive bientôt.
              </p>
            }
            <div class="reveal flex flex-col gap-3" [style.animation-delay.ms]="80">
              @if (pdfUrl(); as url) {
                <hk-pdf-pages
                  data-testid="menu-pdf"
                  [url]="url"
                  title="La carte de {{ m.restaurantName }}"
                />
              }
              @if (pdfFile(); as pdf) {
                <a
                  data-testid="open-pdf"
                  [href]="pdf.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary inline-flex items-center gap-2 self-start text-sm underline"
                >
                  <hk-icon name="lucideExternalLink" [size]="14" />
                  Ouvrir la carte en plein écran
                </a>
              }
            </div>
          }
          @default {
            <p class="text-text-muted reveal text-base" [style.animation-delay.ms]="80">
              La carte de {{ m.restaurantName }} arrive bientôt.
            </p>
          }
        }

        <footer
          class="border-border reveal flex flex-col gap-3 border-t pt-6"
          [style.animation-delay.ms]="200"
        >
          @if (reservation(); as reservationId) {
            <a
              data-testid="link-reschedule"
              [routerLink]="['/client/reservations', reservationId, 'reschedule']"
              class="text-primary inline-flex items-center gap-2 text-sm underline"
            >
              Vous voulez modifier votre réservation ?
            </a>
          } @else {
            <a
              data-testid="link-schedule"
              [routerLink]="['/client/restaurants', id(), 'schedule']"
              class="bg-primary text-primary-foreground inline-flex items-center gap-2 self-start rounded-md px-4 py-2 text-sm font-medium"
            >
              Réserver une table
            </a>
          }
        </footer>
      }
    </article>
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
export class RestaurantMenuPage {
  private readonly service = inject(MenuService);

  // Parametre de route et parametre de requete, lies par withComponentInputBinding.
  readonly id = input<string>();
  readonly reservation = input<string>();

  protected readonly menu = signal<PublicMenu | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<'not_found' | 'failed' | null>(null);

  protected readonly pdfFile = computed(
    () => this.menu()?.files.find((f) => f.kind === 'pdf') ?? null,
  );
  // Seule une URL de fichier public verifiee par sa forme est rendue, jamais une valeur libre.
  protected readonly pdfUrl = computed<string | null>(() => {
    const file = this.pdfFile();
    return file && isSafePublicFileUrl(file.url) ? file.url : null;
  });

  constructor() {
    effect(() => {
      if (this.id()) {
        this.load();
      }
    });
  }

  protected load(): void {
    const restaurantId = this.id();
    if (!restaurantId) return;
    this.loading.set(true);
    this.error.set(null);
    this.service.getPublic(restaurantId).subscribe({
      next: (menu) => {
        this.menu.set(menu);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 404 ? 'not_found' : 'failed',
        );
        this.loading.set(false);
      },
    });
  }

  protected price(value: string): string {
    return formatPrice(value);
  }
}
