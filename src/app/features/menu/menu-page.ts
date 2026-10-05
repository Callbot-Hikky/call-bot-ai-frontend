import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, from, of, toArray } from 'rxjs';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkQrCard } from '@shared/components/molecules/qr-card/hk-qr-card';
import { HkFocusOnInit } from '@shared/directives/hk-focus-on-init';
import { RestaurantService } from '@core/services/restaurant.service';
import { humanSize } from '@core/utils/format';
import { MenuFileRow } from './components/menu-file-row';
import { MenuPdfSection } from './components/menu-pdf-section/menu-pdf-section';
import { MenuImagesSection } from './components/menu-images-section/menu-images-section';
import { MenuManualSection } from './components/menu-manual-section/menu-manual-section';
import { MenuService, SaveState } from '@core/services/menu.service';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import {
  Menu,
  DEFAULT_LIMITS,
  FILE_TYPE_MIME,
  ManualMenu,
  MenuFile,
  MenuMode,
  emptyManual,
  isSafeAdminFileUrl,
} from '@core/models/menu.model';

/** Les trois modes qu'on peut ouvrir a l'ecran : « none » n'en est pas un. */
type EditableMode = Exclude<MenuMode, 'none'>;

interface ModeCard {
  mode: Exclude<MenuMode, 'none'>;
  icon: string;
  title: string;
  description: string;
}

// Ces tuiles decrivent le MODE, jamais ses limites : le compte et le poids exacts
// viennent du serveur et sont affiches par pdfHint()/imageHint().
const MODE_CARDS: ModeCard[] = [
  {
    mode: 'pdf',
    icon: 'lucideFileText',
    title: 'PDF',
    description: 'Vos cartes en PDF : plats, vins, desserts.',
  },
  {
    mode: 'images',
    icon: 'lucideImage',
    title: 'Photos',
    description: 'Des photos de votre carte, prises au téléphone.',
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
  saving: 'Enregistrement en cours',
  dirty: 'Modifications à enregistrer',
  failed: "Échec de l'enregistrement",
};

// Page « Carte et QR codes » du restaurateur : choisir ce qui est publié (PDF,
// photos ou saisie), preparer le contenu de chaque mode, voir l'etat.
// Cliquer une carte publie ce mode ; si son contenu manque, le back refuse et
// la zone reste ouverte pour l'ajouter. Le back est la source de verite.
//
// PLAN DU GABARIT, dans l'ordre : le bandeau de publication, les trois tuiles de
// mode, puis un @switch qui n'ouvre QUE la zone du mode consulte (PDF, photos ou
// saisie), et enfin les deux QR. Le gabarit est long parce que les trois zones
// sont exclusives et ne partagent ni leur contenu ni leurs actions : les extraire
// donnerait trois composants a un seul appelant, chacun reclamant en entree la
// moitie de l'etat de cette page.
@Component({
  selector: 'app-menu',
  imports: [
    HkPageHeader,
    HkButton,
    HkIcon,
    HkSkeleton,
    HkQrCard,
    HkFocusOnInit,
    RouterLink,
    MenuPdfSection,
    MenuImagesSection,
    MenuManualSection,
  ],
  templateUrl: './menu-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuPage {
  protected readonly service = inject(MenuService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly restaurants = inject(RestaurantService);

  // Signal, pas instantane : un changement de restaurant dans la session met les QR a jour.
  protected readonly restaurantId = this.session.restaurantId;
  protected readonly cards = MODE_CARDS;

  // Les liens publics sont sur la meme origine que l'application.
  protected readonly menuUrl = computed(
    () => `${location.origin}/client/restaurants/${this.restaurantId()}/menu`,
  );
  protected readonly bookingUrl = computed(
    () => `${location.origin}/client/restaurants/${this.restaurantId()}/schedule`,
  );
  // Nom de fichier lisible : « menu-le-bistrot-du-coin.png ».
  protected readonly slug = computed(() =>
    toSlug(this.restaurants.restaurant()?.name ?? 'restaurant'),
  );
  protected readonly pdfMimes = [FILE_TYPE_MIME.pdf];
  protected readonly imageMimes = [FILE_TYPE_MIME.jpeg, FILE_TYPE_MIME.png, FILE_TYPE_MIME.webp];

  protected readonly menu = this.service.menu;
  // Zone ouverte a l'ecran : le mode publie par defaut, ou la carte cliquee.
  // `linkedSignal` plutot qu'un effet garde par un drapeau : la valeur repart du
  // menu charge a chaque fois qu'il change (y compris un changement de restaurant),
  // tout en restant modifiable par l'utilisateur entre deux chargements.
  protected readonly editing = linkedSignal<Menu | null, EditableMode>({
    source: this.menu,
    computation: (menu, previous) =>
      menu ? (menu.mode === 'none' ? (previous?.value ?? 'pdf') : menu.mode) : 'pdf',
  });
  protected readonly draft = linkedSignal<Menu | null, ManualMenu>({
    source: this.menu,
    computation: (menu) => menu?.manual ?? emptyManual(),
  });
  protected readonly pendingFile = signal<string | null>(null);
  protected readonly pendingUnpublish = signal(false);

  protected readonly pdfs = computed(() =>
    (this.menu()?.files ?? [])
      .filter((f) => f.kind === 'pdf')
      .sort((a, b) => a.position - b.position),
  );
  protected readonly canAddPdf = computed(
    () => this.pdfs().length < (this.menu()?.limits.pdfMaxCount ?? DEFAULT_LIMITS.pdfMaxCount),
  );
  // Libelles du bandeau « pas encore publie ». Ils vivent ici et non dans le template :
  // le pluriel porte sur la phrase entiere, et une apostrophe a l'interieur d'une
  // interpolation ferme la chaine, ce qui affiche le {{ ... }} brut a l'ecran.
  // Les limites affichees viennent du serveur : les reecrire a la main ici, c'est
  // mentir au restaurateur le jour ou le serveur change de politique.
  protected readonly pdfHint = computed(() => {
    const limits = this.menu()?.limits ?? DEFAULT_LIMITS;
    return `ou cliquez pour les choisir. Jusqu'à ${limits.pdfMaxCount} PDF (plats, vins, desserts), ${humanSize(limits.pdfMaxBytes)} maximum chacun.`;
  });
  protected readonly imageHint = computed(() => {
    const limits = this.menu()?.limits ?? DEFAULT_LIMITS;
    return `ou cliquez pour les choisir, plusieurs à la fois. JPEG, PNG ou WebP, ${humanSize(limits.imageMaxBytes)} max chacune.`;
  });
  protected readonly pdfPendingText = computed(() =>
    this.pdfs().length > 1
      ? 'Vos PDF sont prêts. Ils ne sont pas encore visibles par vos clients.'
      : "Votre PDF est prêt. Il n'est pas encore visible par vos clients.",
  );
  protected readonly pdfPublishLabel = computed(() =>
    this.pdfs().length > 1 ? 'Publier les PDF' : 'Publier le PDF',
  );
  // Lignes pretes a afficher : l'adresse d'apercu et la taille sont calculees ici,
  // une seule fois, au lieu d'etre recalculees a chaque rendu depuis le gabarit.
  protected readonly pdfRows = computed<MenuFileRow[]>(() => this.pdfs().map(toRow));
  protected readonly imageRows = computed<MenuFileRow[]>(() => this.images().map(toRow));
  protected readonly images = computed(() =>
    (this.menu()?.files ?? [])
      .filter((f) => f.kind === 'image')
      .sort((a, b) => a.position - b.position),
  );
  protected readonly canAddImage = computed(
    () =>
      this.images().length < (this.menu()?.limits.imageMaxCount ?? DEFAULT_LIMITS.imageMaxCount),
  );
  // Rien tant que rien n'a ete modifie : « Enregistré » sur une page intacte n'apprend rien.
  protected readonly saveLabel = computed(() => {
    if (!this.service.touched()) {
      return '';
    }
    return this.service.saveState() === 'failed' && this.service.lastError()
      ? this.service.lastError()!
      : SAVE_LABELS[this.service.saveState()];
  });

  constructor() {
    // Le restaurant de la session peut changer pendant que la page vit : le menu
    // doit suivre, sinon les deux QR designeraient un restaurant et la carte un autre.
    effect(() => {
      const restaurantId = this.restaurantId();
      if (restaurantId) {
        this.service.load(restaurantId);
        this.restaurants.loadRestaurant(restaurantId);
      }
    });
    // Une saisie encore en attente part avant de quitter la page.
    this.destroyRef.onDestroy(() => this.service.flushManualSave());
  }

  protected retry(): void {
    const restaurantId = this.restaurantId();
    if (restaurantId) {
      this.service.load(restaurantId);
    }
  }

  protected countFor(mode: MenuMode): string {
    switch (mode) {
      case 'pdf': {
        const n = this.pdfs().length;
        return n === 0 ? 'Aucun fichier' : `${n} PDF`;
      }
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

  protected confirmUnpublish(): void {
    this.pendingUnpublish.set(false);
    this.publish('none');
  }

  // Un clic sur une carte ouvre sa preparation, rien de plus : publier reste un geste
  // explicite (bouton « Publier ... »), pour ne jamais changer la carte visible par surprise.
  protected open(mode: MenuMode): void {
    if (mode !== 'none') {
      this.editing.set(mode);
    }
  }

  // Le back garde son refus (409) comme garde-fou, mais on ne le provoque pas pour rien.
  protected publish(mode: MenuMode): void {
    if (this.menu()?.mode === mode || (mode !== 'none' && !this.isReady(mode))) {
      return;
    }
    this.service
      .setMode(mode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this.toast.show(
            mode === 'none' ? "Votre carte n'est plus publiée." : 'Votre carte est publiée.',
            'success',
          ),
        error: (err: Error) => this.toast.show(err.message, 'error'),
      });
  }

  // Les fichiers partent un par un, dans l'ordre : un refus n'arrete pas les suivants,
  // et un seul bilan est affiche a la fin.
  protected onFiles(files: File[]): void {
    from(files)
      .pipe(
        concatMap((file) =>
          this.service
            .upload(file)
            .pipe(catchError((err: Error) => of({ failed: file.name, reason: err.message }))),
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        const failures = results.filter(
          (r): r is { failed: string; reason: string } => 'failed' in r,
        );
        const sent = results.length - failures.length;
        if (failures.length === 0) {
          // Le type annonce peut manquer (glisser-deposer) : on regarde aussi l'extension.
          const isPdf = files.every((f) => f.type === FILE_TYPE_MIME.pdf || /\.pdf$/i.test(f.name));
          const single = isPdf ? 'PDF ajouté.' : 'Photo ajoutée.';
          const many = isPdf ? `${sent} PDF ajoutés.` : `${sent} photos ajoutées.`;
          this.toast.show(sent === 1 ? single : many, 'success');
        } else if (sent === 0) {
          this.toast.show(failures[0].reason, 'error');
        } else {
          this.toast.show(
            `${sent} sur ${results.length} envoyés. « ${failures[0].failed} » : ${failures[0].reason}`,
            'error',
          );
        }
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
              ? "Fichier supprimé. Plus rien n'est publié."
              : 'Fichier supprimé.',
            'success',
          ),
        error: (err: Error) => this.toast.show(err.message, 'error'),
      });
  }

  // Le reordonnancement porte sur un seul genre : PDF entre eux, photos entre elles.
  protected move(fileId: string, direction: -1 | 1, kind: 'pdf' | 'image' = 'image'): void {
    const ids = (kind === 'pdf' ? this.pdfs() : this.images()).map((f) => f.id);
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

  // Un format se publie des qu'il a du contenu : le bandeau propose alors le bouton.
  protected isReady(mode: MenuMode): boolean {
    switch (mode) {
      case 'pdf':
        return this.pdfs().length > 0;
      case 'images':
        return this.images().length > 0;
      case 'manual':
        return this.draft().sections.length > 0;
      default:
        return false;
    }
  }

  protected publishAction(mode: MenuMode): string {
    switch (mode) {
      case 'pdf':
        return this.pdfs().length > 1 ? 'Publier les PDF' : 'Publier le PDF';
      case 'images':
        return 'Publier les photos';
      case 'manual':
        return 'Publier la saisie';
      default:
        return '';
    }
  }

  protected publishedLabel(mode: MenuMode): string {
    switch (mode) {
      case 'pdf':
        return this.pdfs().length > 1 ? 'vos cartes en PDF' : 'votre carte en PDF';
      case 'images':
        return 'vos photos';
      case 'manual':
        return 'votre carte saisie';
      default:
        return '';
    }
  }
}

// « Le Bistrot du Coin » -> « le-bistrot-du-coin » : minuscules, sans accents, tirets.
function toSlug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'restaurant'
  );
}

// Seule l'URL admin de NOTRE fichier, verifiee par sa forme, est rendue :
// une adresse qui ne correspond pas n'affiche rien plutot que n'importe quoi.
function toRow(file: MenuFile): MenuFileRow {
  return {
    file,
    previewUrl: isSafeAdminFileUrl(file.url) ? file.url : null,
    size: humanSize(file.sizeBytes),
  };
}
