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
  templateUrl: './restaurant-menu.html',
  styleUrl: './restaurant-menu.css',
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
