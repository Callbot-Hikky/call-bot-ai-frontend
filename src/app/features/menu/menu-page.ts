import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, from } from 'rxjs';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkFileDropzone } from '@shared/components/molecules/file-dropzone/hk-file-dropzone';
import { HkMenuManualForm } from '@shared/components/organisms/menu-manual-form/hk-menu-manual-form';
import { MenuService, SaveState } from '@core/services/menu.service';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import { FILE_TYPE_MIME, ManualMenu, MenuMode, emptyManual } from '@core/models/menu.model';

interface ModeCard {
  mode: Exclude<MenuMode, 'none'>;
  icon: string;
  title: string;
  description: string;
}

const MODE_CARDS: ModeCard[] = [
  {
    mode: 'pdf',
    icon: 'lucideFileText',
    title: 'PDF',
    description: 'Déposez votre carte en un fichier.',
  },
  {
    mode: 'images',
    icon: 'lucideImage',
    title: 'Photos',
    description: "Jusqu'à 8 photos de votre carte.",
  },
  {
    mode: 'manual',
    icon: 'lucidePencil',
    title: 'Saisie manuelle',
    description: 'Tapez vos sections et vos plats.',
  },
];

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Enregistré',
  saving: 'Enregistrément en cours',
  dirty: 'Modifications à enregistrer',
  failed: "Échec de l'enregistrement",
};

// Page « Menu et QR code » du restaurateur : choisir ce qui est publié (PDF,
// photos ou saisie), preparer le contenu de chaque mode, voir l'etat.
// Cliquer une carte publie ce mode ; si son contenu manque, le back refuse et
// la zone reste ouverte pour l'ajouter. Le back est la source de verite.
@Component({
  selector: 'app-menu',
  imports: [HkPageHeader, HkButton, HkIcon, HkSkeleton, HkFileDropzone, HkMenuManualForm],
  template: `
    <hk-page-header
      subtitle="Choisissez comment vos clients voient votre carte : un PDF, des photos ou une saisie à la main. Un seul mode est publié à la fois."
    >
      <span class="text-text-subtle text-xs" data-testid="save-state" aria-live="polite">
        {{ saveLabel() }}
      </span>
    </hk-page-header>

    @if (!restaurantId) {
      <div class="bg-card border-border/70 rounded-lg border p-10 text-center shadow-md">
        <p class="text-text-strong font-medium">Aucun restaurant n'est rattaché à votre compte.</p>
        <p class="text-muted-foreground text-sm">
          Terminez d'abord la configuration de votre restaurant.
        </p>
      </div>
    } @else if (service.error()) {
      <div
        class="bg-card border-border/70 flex flex-col items-center gap-3 rounded-lg border p-10 text-center shadow-md"
      >
        <hk-icon name="lucideTriangleAlert" [size]="32" class="text-st-cancelled-fg" />
        <p class="text-text-strong text-base font-medium">Impossible de charger le menu</p>
        <p class="text-muted-foreground text-sm">Vérifiez votre connexion et réessayez.</p>
        <hk-button size="sm" variant="secondary" data-testid="menu-retry" (click)="retry()">
          <hk-icon name="lucideRefreshCw" [size]="14" />
          Réessayer
        </hk-button>
      </div>
    } @else if (service.loading() || !menu()) {
      <div class="flex flex-col gap-6">
        <div class="grid gap-4 sm:grid-cols-3">
          <hk-skeleton height="7rem" />
          <hk-skeleton height="7rem" />
          <hk-skeleton height="7rem" />
        </div>
        <hk-skeleton height="12rem" />
      </div>
    } @else {
      <div class="flex flex-col gap-8">
        <div class="grid gap-4 sm:grid-cols-3" role="group" aria-label="Mode de publication">
          @for (card of cards; track card.mode) {
            <button
              type="button"
              [attr.data-testid]="'mode-' + card.mode"
              class="bg-card hover:border-primary flex flex-col gap-2 rounded-lg border p-4 text-left shadow-sm transition-colors focus-visible:ring-2"
              [class.border-primary]="editing() === card.mode"
              [class.border-border]="editing() !== card.mode"
              [attr.aria-pressed]="menu()!.mode === card.mode"
              [attr.aria-label]="'Publier : ' + card.title"
              [disabled]="service.saving()"
              (click)="choose(card.mode)"
            >
              <div class="flex items-center justify-between">
                <hk-icon [name]="card.icon" [size]="20" class="text-primary" />
                @if (menu()!.mode === card.mode) {
                  <span
                    class="bg-st-confirmed-bg text-st-confirmed-fg rounded-full px-2 py-0.5 text-xs font-medium"
                  >
                    Publié
                  </span>
                }
              </div>
              <span class="text-text-strong font-semibold">{{ card.title }}</span>
              <span class="text-text-subtle text-xs">{{ card.description }}</span>
              <span class="text-text-subtle text-xs">{{ countFor(card.mode) }}</span>
            </button>
          }
        </div>

        @if (menu()!.mode !== 'none') {
          <div>
            <hk-button
              variant="ghost"
              size="sm"
              data-testid="unpublish"
              [disabled]="service.saving()"
              (click)="choose('none')"
            >
              Ne rien publier pour l'instant
            </hk-button>
          </div>
        } @else {
          <p class="text-text-subtle text-sm" data-testid="nothing-published">
            Rien n'est publié pour l'instant : vos clients voient « menu bientôt disponible ».
          </p>
        }

        @switch (editing()) {
          @case ('pdf') {
            <section class="flex flex-col gap-4" aria-label="Carte en PDF">
              @if (pdfFile(); as pdf) {
                <div
                  class="bg-card border-border/70 flex flex-wrap items-center gap-3 rounded-lg border p-4"
                >
                  <hk-icon name="lucideFileText" [size]="24" class="text-primary" />
                  <div class="flex-1">
                    <p class="text-text-strong text-sm font-medium">Carte en PDF</p>
                    <p class="text-text-subtle text-xs">{{ humanSize(pdf.sizeBytes) }}</p>
                  </div>
                  <a
                    [href]="pdf.url"
                    target="_blank"
                    rel="noopener"
                    class="text-primary flex items-center gap-1 text-sm underline"
                    data-testid="open-pdf"
                  >
                    <hk-icon name="lucideExternalLink" [size]="14" />
                    Ouvrir
                  </a>
                  <hk-button
                    variant="ghost"
                    size="sm"
                    [attr.data-testid]="'remove-file-' + pdf.id"
                    [disabled]="service.saving()"
                    (click)="askRemove(pdf.id)"
                  >
                    <hk-icon name="lucideTrash2" [size]="16" /><span class="sr-only"
                      >Supprimer</span
                    >
                  </hk-button>
                </div>
                @if (pendingFile() === pdf.id) {
                  <div
                    class="bg-muted flex flex-wrap items-center gap-2 rounded-md p-3 text-sm"
                    role="alert"
                  >
                    <span>Supprimer ce PDF ?</span>
                    <hk-button
                      variant="danger"
                      size="sm"
                      data-testid="confirm-remove-file"
                      (click)="confirmRemove()"
                      >Supprimer</hk-button
                    >
                    <hk-button variant="secondary" size="sm" (click)="pendingFile.set(null)"
                      >Annuler</hk-button
                    >
                  </div>
                }
                <p class="text-text-subtle text-xs">Déposer un nouveau PDF remplace celui-ci.</p>
              }
              <hk-file-dropzone
                [accept]="pdfMimes"
                [maxBytes]="menu()!.limits.pdfMaxBytes"
                [disabled]="service.saving()"
                label="Glissez votre carte en PDF ici"
                hint="ou cliquez pour la choisir (10 Mo max)"
                (filesPicked)="onFiles($event)"
              />
            </section>
          }
          @case ('images') {
            <section class="flex flex-col gap-4" aria-label="Carte en photos">
              @if (images().length > 0) {
                <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="image-list">
                  @for (
                    file of images();
                    track file.id;
                    let i = $index;
                    let first = $first;
                    let last = $last
                  ) {
                    <li class="bg-card border-border/70 flex flex-col gap-2 rounded-lg border p-2">
                      <img
                        data-testid="image-thumb"
                        [src]="file.url"
                        [alt]="'Photo ' + (i + 1) + ' de la carte'"
                        class="aspect-[3/4] w-full rounded-md object-cover"
                        loading="lazy"
                      />
                      <div class="flex items-center justify-between gap-1">
                        <span class="text-text-subtle text-xs tabular-nums"
                          >{{ i + 1 }}/{{ images().length }}</span
                        >
                        <div class="flex gap-1">
                          <hk-button
                            variant="ghost"
                            size="sm"
                            [attr.data-testid]="'move-up-' + file.id"
                            [disabled]="first || service.saving()"
                            (click)="move(file.id, -1)"
                          >
                            <hk-icon name="lucideChevronUp" [size]="16" /><span class="sr-only"
                              >Monter la photo</span
                            >
                          </hk-button>
                          <hk-button
                            variant="ghost"
                            size="sm"
                            [attr.data-testid]="'move-down-' + file.id"
                            [disabled]="last || service.saving()"
                            (click)="move(file.id, 1)"
                          >
                            <hk-icon name="lucideChevronDown" [size]="16" /><span class="sr-only"
                              >Descendre la photo</span
                            >
                          </hk-button>
                          <hk-button
                            variant="ghost"
                            size="sm"
                            [attr.data-testid]="'remove-file-' + file.id"
                            [disabled]="service.saving()"
                            (click)="askRemove(file.id)"
                          >
                            <hk-icon name="lucideTrash2" [size]="16" /><span class="sr-only"
                              >Supprimer</span
                            >
                          </hk-button>
                        </div>
                      </div>
                      @if (pendingFile() === file.id) {
                        <div
                          class="bg-muted flex flex-wrap items-center gap-2 rounded-md p-2 text-xs"
                          role="alert"
                        >
                          <span>Supprimer ?</span>
                          <hk-button
                            variant="danger"
                            size="sm"
                            data-testid="confirm-remove-file"
                            (click)="confirmRemove()"
                            >Oui</hk-button
                          >
                          <hk-button variant="secondary" size="sm" (click)="pendingFile.set(null)"
                            >Non</hk-button
                          >
                        </div>
                      }
                    </li>
                  }
                </ul>
              }
              <p class="text-text-subtle text-xs" data-testid="image-count">
                {{ images().length }}/{{ menu()!.limits.imageMaxCount }} photos. L'ordre affiche est
                l'ordre vu par vos clients.
              </p>
              <hk-file-dropzone
                [accept]="imageMimes"
                [maxBytes]="menu()!.limits.imageMaxBytes"
                [multiple]="true"
                [disabled]="service.saving() || !canAddImage()"
                [label]="canAddImage() ? 'Glissez vos photos ici' : 'Limite de photos atteinte'"
                hint="JPEG, PNG ou WebP, 5 Mo max chacune"
                (filesPicked)="onFiles($event)"
              />
            </section>
          }
          @case ('manual') {
            <section class="flex flex-col gap-4" aria-label="Carte saisie à la main">
              <hk-menu-manual-form
                [menu]="draft()"
                (menuChange)="onManualChange($event)"
                [disabled]="service.loading()"
              />
              <div class="flex items-center gap-3">
                <hk-button
                  size="sm"
                  data-testid="save-manual"
                  [disabled]="service.saving()"
                  (click)="saveNow()"
                >
                  <hk-icon name="lucideSave" [size]="16" />
                  Enregistrér maintenant
                </hk-button>
                <span class="text-text-subtle text-xs"
                  >Vos modifications sont enregistrées automatiquement.</span
                >
              </div>
            </section>
          }
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuPage {
  protected readonly service = inject(MenuService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly restaurantId = this.session.restaurantId();
  protected readonly cards = MODE_CARDS;
  protected readonly pdfMimes = [FILE_TYPE_MIME.pdf];
  protected readonly imageMimes = [FILE_TYPE_MIME.jpeg, FILE_TYPE_MIME.png, FILE_TYPE_MIME.webp];

  protected readonly menu = this.service.menu;
  // Zone ouverte a l'ecran : le mode publie par defaut, ou la carte cliquee.
  protected readonly editing = signal<MenuMode>('pdf');
  protected readonly pendingFile = signal<string | null>(null);
  protected readonly draft = signal<ManualMenu>(emptyManual());
  private draftInitialized = false;

  protected readonly pdfFile = computed(
    () => this.menu()?.files.find((f) => f.kind === 'pdf') ?? null,
  );
  protected readonly images = computed(() =>
    (this.menu()?.files ?? [])
      .filter((f) => f.kind === 'image')
      .sort((a, b) => a.position - b.position),
  );
  protected readonly canAddImage = computed(
    () => this.images().length < (this.menu()?.limits.imageMaxCount ?? 8),
  );
  protected readonly saveLabel = computed(() =>
    this.service.saveState() === 'failed' && this.service.lastError()
      ? this.service.lastError()!
      : SAVE_LABELS[this.service.saveState()],
  );

  constructor() {
    if (this.restaurantId) {
      this.service.load(this.restaurantId);
    }
    effect(() => {
      const menu = this.menu();
      if (menu && !this.draftInitialized) {
        this.draft.set(menu.manual);
        this.editing.set(menu.mode === 'none' ? 'pdf' : menu.mode);
        this.draftInitialized = true;
      }
    });
  }

  protected retry(): void {
    if (this.restaurantId) {
      this.service.load(this.restaurantId);
    }
  }

  protected countFor(mode: MenuMode): string {
    switch (mode) {
      case 'pdf':
        return this.pdfFile() ? '1 fichier prêt' : 'Aucun fichier';
      case 'images': {
        const n = this.images().length;
        return n === 0 ? 'Aucune photo' : `${n} photo${n > 1 ? 's' : ''}`;
      }
      case 'manual': {
        const n = this.draft().sections.length;
        return n === 0 ? 'Aucune section' : `${n} section${n > 1 ? 's' : ''}`;
      }
      default:
        return '';
    }
  }

  protected choose(mode: MenuMode): void {
    if (mode !== 'none') {
      this.editing.set(mode);
    }
    if (this.menu()?.mode === mode) {
      return;
    }
    this.service
      .setMode(mode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this.toast.show(
            mode === 'none' ? 'Menu dépublié.' : 'Mode publié mis à jour.',
            'success',
          ),
        error: (err: Error) => this.toast.show(err.message, 'error'),
      });
  }

  // Les fichiers partent un par un : le back tranche sur les octets, le nombre et la taille.
  protected onFiles(files: File[]): void {
    from(files)
      .pipe(
        concatMap((file) => this.service.upload(file)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.toast.show('Fichier ajouté.', 'success'),
        error: (err: Error) => this.toast.show(err.message, 'error'),
      });
  }

  protected askRemove(fileId: string): void {
    this.pendingFile.set(fileId);
  }

  protected confirmRemove(): void {
    const fileId = this.pendingFile();
    if (!fileId) return;
    this.pendingFile.set(null);
    this.service
      .removeFile(fileId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (menu) =>
          this.toast.show(
            menu.mode === 'none'
              ? 'Fichier supprimé. Plus rien n est publié.'
              : 'Fichier supprimé.',
            'success',
          ),
        error: (err: Error) => this.toast.show(err.message, 'error'),
      });
  }

  protected move(fileId: string, direction: -1 | 1): void {
    const ids = this.images().map((f) => f.id);
    const index = ids.indexOf(fileId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.service
      .reorder(ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: (err: Error) => this.toast.show(err.message, 'error') });
  }

  protected onManualChange(menu: ManualMenu): void {
    this.draft.set(menu);
    this.service.scheduleManualSave(menu);
  }

  protected saveNow(): void {
    this.service
      .saveManual(this.draft())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.show('Menu enregistré.', 'success'),
        error: (err: Error) => this.toast.show(err.message, 'error'),
      });
  }

  protected humanSize(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
      : `${Math.round(bytes / 1024)} Ko`;
  }
}
