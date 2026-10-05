import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkClientHeader } from '@shared/components/molecules/client-header/hk-client-header';
import { HkPdfPages } from '@shared/components/molecules/pdf-pages/hk-pdf-pages';
import { MenuService } from '@core/services/menu.service';
import { formatPrice, isSafePublicFileUrl } from '@core/models/menu.model';

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

  // Parametre de route et parametre de requete, lies par withComponentInputBinding.
  readonly id = input<string>();
  readonly reservation = input<string>();

  /**
   * La carte publique suit l'identifiant de route : changer d'identifiant relance
   * le chargement et annule reellement la requete precedente (`rxResource` se
   * desabonne de l'observable abandonne). Le statut et l'erreur viennent de la
   * ressource, il n'y a pas d'etat de chargement tenu a la main.
   */
  private readonly menuResource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.service.getPublic(params),
  });

  // hasValue() avant value() : lire la valeur d'une ressource en erreur releve l'erreur.
  protected readonly menu = computed(() =>
    this.menuResource.hasValue() ? this.menuResource.value() : null,
  );
  protected readonly loading = this.menuResource.isLoading;

  // Un identifiant inconnu ne se retente pas : la page le distingue d'une panne.
  protected readonly error = computed<'not_found' | 'failed' | null>(() => {
    const err = this.menuResource.error();
    if (!err) return null;
    return err instanceof HttpErrorResponse && err.status === 404 ? 'not_found' : 'failed';
  });

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

  constructor() {
    // Le titre de l'onglet est un effet de bord sur une API hors du graphe de signaux :
    // c'est le seul cas ou un effect est le bon outil ici.
    effect(() => {
      const menu = this.menu();
      if (menu) {
        this.title.setTitle(`La carte de ${menu.restaurantName}`);
      }
    });
  }

  protected pdfTitle(restaurantName: string, index: number): string {
    const n = this.pdfs().length;
    return n > 1
      ? `Carte ${index + 1} sur ${n} de ${restaurantName}`
      : `La carte de ${restaurantName}`;
  }

  /** Nouvelle tentative apres une panne reseau. */
  protected load(): void {
    this.menuResource.reload();
  }

  protected price(value: string): string {
    return formatPrice(value);
  }
}
