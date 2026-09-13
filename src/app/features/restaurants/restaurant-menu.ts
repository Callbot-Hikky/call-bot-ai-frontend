import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkClientHeader } from '@shared/components/molecules/client-header/hk-client-header';
import { HkPdfPages } from '@shared/components/molecules/pdf-pages/hk-pdf-pages';
import { MenuService } from '@core/services/menu.service';
import { PublicMenu, formatPrice, isSafePublicFileUrl } from '@core/models/menu.model';

@Component({
  selector: 'app-restaurant-menu',
  imports: [RouterLink, HkIcon, HkSkeleton, HkPdfPages, HkClientHeader],
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
        <hk-client-header eyebrow="La carte" [title]="m.restaurantName" />

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
              @for (file of images(); track file.id; let i = $index) {
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
            @if (pdfs().length === 0) {
              <p class="text-text-muted reveal text-base" [style.animation-delay.ms]="80">
                @if (m.files.length > 0) {
                  La carte n'a pas pu être chargée. Réessayez dans un instant.
                } @else {
                  La carte de {{ m.restaurantName }} arrive bientôt.
                }
              </p>
            }
            <!-- Plusieurs cartes (plats, vins, desserts) s'enchainent dans l'ordre du restaurateur. -->
            <div class="reveal flex flex-col gap-8" [style.animation-delay.ms]="80">
              @for (pdf of pdfs(); track pdf.id; let i = $index) {
                <div class="flex flex-col gap-3" data-testid="menu-pdf-block">
                  <hk-pdf-pages
                    data-testid="menu-pdf"
                    [url]="pdf.url"
                    [title]="pdfTitle(m.restaurantName, i)"
                  />
                  <a
                    data-testid="open-pdf"
                    [href]="pdf.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary inline-flex items-center gap-2 self-start text-sm underline"
                  >
                    <hk-icon name="lucideExternalLink" [size]="14" />
                    {{
                      pdfs().length > 1
                        ? 'Ouvrir cette carte en plein écran'
                        : 'Ouvrir la carte en plein écran'
                    }}
                  </a>
                </div>
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
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  // Parametre de route et parametre de requete, lies par withComponentInputBinding.
  readonly id = input<string>();
  readonly reservation = input<string>();

  protected readonly menu = signal<PublicMenu | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<'not_found' | 'failed' | null>(null);

  // Seules les URL de fichiers publics verifiees par leur forme sont rendues, jamais une valeur libre.
  // Memes filtres pour les photos que pour les PDF : genre, forme de l'URL, ordre du restaurateur.
  protected readonly images = computed(() =>
    (this.menu()?.files ?? [])
      .filter((f) => f.kind === 'image' && isSafePublicFileUrl(f.url))
      .sort((a, b) => a.position - b.position),
  );
  protected readonly pdfs = computed(() =>
    (this.menu()?.files ?? [])
      .filter((f) => f.kind === 'pdf' && isSafePublicFileUrl(f.url))
      .sort((a, b) => a.position - b.position),
  );

  protected pdfTitle(restaurantName: string, index: number): string {
    const n = this.pdfs().length;
    return n > 1
      ? `Carte ${index + 1} sur ${n} de ${restaurantName}`
      : `La carte de ${restaurantName}`;
  }

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
    this.service
      .getPublic(restaurantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (menu) => {
          this.menu.set(menu);
          this.title.setTitle(`La carte de ${menu.restaurantName}`);
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
