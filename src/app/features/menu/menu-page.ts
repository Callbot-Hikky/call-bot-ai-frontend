import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, from, of, toArray } from 'rxjs';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkQrCard } from '@shared/components/molecules/qr-card/hk-qr-card';
import { RestaurantService } from '@core/services/restaurant.service';
import { humanSize } from '@core/utils/format';
import { HkInlineConfirm } from '@shared/components/molecules/inline-confirm/hk-inline-confirm';
import { MenuFileRow } from './menu-file-row';
import { MenuPdfSection } from './menu-pdf-section/menu-pdf-section';
import { MenuImagesSection } from './menu-images-section/menu-images-section';
import { MenuManualSection } from './menu-manual-section/menu-manual-section';
import { MenuService, SaveState } from '@core/services/menu.service';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import {
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

/**
 * Tout ce que l'ecran dit d'un format : son decompte sur la tuile, s'il a de quoi
 * etre publie, le libelle de son bouton et la façon de le nommer dans la phrase
 * « Vos clients voient ... ». Regroupe ici parce que ces quatre informations
 * dependent des memes donnees et changent ensemble.
 */
interface ModeSummary {
  readonly count: string;
  readonly ready: boolean;
  readonly publishAction: string;
  readonly publishedLabel: string;
}

interface ModeCard {
  mode: EditableMode;
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
// PLAN DU GABARIT, dans l'ordre : les deux QR (en tete, pour rester visibles sans
// defiler), les trois tuiles de mode, le bandeau de publication, puis un @switch
// qui n'ouvre QUE la zone du mode consulte. Chacune de ces trois zones vit dans
// son propre composant (MenuPdfSection, MenuImagesSection, MenuManualSection) :
// cette page coordonne, elles affichent. Elle garde donc l'etat et les appels au
// service ; les sections ne recoivent que de quoi dessiner et remontent des
// intentions.
@Component({
  selector: 'app-menu',
  imports: [
    HkPageHeader,
    HkButton,
    HkIcon,
    HkSkeleton,
    HkQrCard,
    RouterLink,
    MenuPdfSection,
    MenuImagesSection,
    MenuManualSection,
    HkInlineConfirm,
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
  // La source est le chargement, pas l'objet Menu : le service en remet un neuf a
  // chaque reponse (ajout, suppression, enregistrement automatique) et repartir de
  // celui-la refermerait la zone sous les doigts de l'utilisateur. Le menu se lit
  // donc hors suivi reactif, juste pour la valeur de depart.
  protected readonly editing = linkedSignal<string | null, EditableMode>({
    source: this.service.loadedRestaurantId,
    computation: (_restaurantId, previous) => {
      const mode = untracked(this.menu)?.mode;
      return mode && mode !== 'none' ? mode : (previous?.value ?? 'pdf');
    },
  });
  // Meme raison : la frappe en cours ne doit pas reculer quand la reponse d'un
  // enregistrement automatique arrive avec une version anterieure de la saisie.
  protected readonly draft = linkedSignal<string | null, ManualMenu>({
    source: this.service.loadedRestaurantId,
    computation: () => untracked(this.menu)?.manual ?? emptyManual(),
  });
  // Chaque format decrit en un seul endroit, au lieu de quatre methodes
  // parallelees qu'il fallait penser a completer ensemble.
  protected readonly modes = computed<Record<EditableMode, ModeSummary>>(() => {
    const pdfs = this.pdfs().length;
    const images = this.images().length;
    const sections = this.draft().sections.length;
    return {
      pdf: {
        count: pdfs === 0 ? 'Aucun fichier' : `${pdfs} PDF`,
        ready: pdfs > 0,
        publishAction: pdfs > 1 ? 'Publier les PDF' : 'Publier le PDF',
        publishedLabel: pdfs > 1 ? 'vos cartes en PDF' : 'votre carte en PDF',
      },
      images: {
        count: images === 0 ? 'Aucune photo' : `${images} photo${images > 1 ? 's' : ''}`,
        ready: images > 0,
        publishAction: 'Publier les photos',
        publishedLabel: 'vos photos',
      },
      manual: {
        count: sections === 0 ? 'Aucune section' : `${sections} section${sections > 1 ? 's' : ''}`,
        ready: sections > 0,
        publishAction: 'Publier la saisie',
        publishedLabel: 'votre carte saisie',
      },
    };
  });
  // Le format en preparation, celui que le bandeau propose de publier.
  protected readonly editingMode = computed(() => this.modes()[this.editing()]);
  // Le format publie, ou rien. Le gabarit s'y accroche plutot qu'a `menu()!.mode` :
  // il n'a plus a affirmer que le menu est charge, ni a traiter le cas « none ».
  protected readonly publishedMode = computed<EditableMode | null>(() => {
    const mode = this.menu()?.mode;
    return mode && mode !== 'none' ? mode : null;
  });
  // Les limites du serveur, ou celles par defaut avant son arrivee.
  protected readonly limits = computed(() => this.menu()?.limits ?? DEFAULT_LIMITS);
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
      if (!restaurantId) {
        return;
      }
      // `untracked` : `loadRestaurant` consulte le restaurant deja en memoire pour
      // eviter un GET en double. Sans cette barriere, l'effet dependrait de cette
      // lecture et se rejouerait a l'arrivee de la reponse, rechargeant le menu une
      // seconde fois et jetant au passage une saisie encore en attente d'envoi.
      untracked(() => {
        this.service.load(restaurantId);
        this.restaurants.loadRestaurant(restaurantId);
      });
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

  protected confirmUnpublish(): void {
    this.pendingUnpublish.set(false);
    this.publish('none');
  }

  // Un clic sur une carte ouvre sa preparation, rien de plus : publier reste un geste
  // explicite (bouton « Publier ... »), pour ne jamais changer la carte visible par surprise.
  protected open(mode: EditableMode): void {
    this.editing.set(mode);
  }

  // Le back garde son refus (409) comme garde-fou, mais on ne le provoque pas pour rien.
  protected publish(mode: MenuMode): void {
    if (this.menu()?.mode === mode || (mode !== 'none' && !this.modes()[mode].ready)) {
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
