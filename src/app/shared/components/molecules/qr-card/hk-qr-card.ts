import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

// Un lien public et son QR code, prets a imprimer. Le QR est genere dans le
// navigateur, pure fonction du lien : rien n'est stocke ni calcule cote serveur.
// Le SVG (vectoriel, pour l'imprimeur) est toujours produit ; le PNG (pour un
// flyer, un reseau social) demande un canvas et n'existe donc que dans un vrai
// navigateur.

// Duree du retour visuel apres copie : assez long pour etre lu, assez court
// pour ne pas laisser croire que le bouton est bloque.
const COPIED_FEEDBACK_MS = 2000;

// Niveau « M » : environ 15 % du dessin peut etre abime sans empecher la lecture.
// C'est le bon compromis pour un code pose sur une table de restaurant ; « L » (7 %)
// est trop fragile, « H » (30 %) densifie le motif et impose de l'imprimer plus grand.
// Marge reduite a 1 module au lieu de 4 : la carte apporte deja son propre blanc.
const QR_OPTIONS = { margin: 1, errorCorrectionLevel: 'M' as const };

// 512 px : assez net pour une publication sur un reseau social, assez leger
// pour tenir dans une data: URL sans alourdir la page.
const PNG_WIDTH = 512;

interface QrImages {
  svg: string;
  /** Absent quand le navigateur n'offre pas de canvas : le SVG suffit a tout. */
  png: string | null;
}

@Component({
  selector: 'hk-qr-card',
  imports: [HkButton, HkIcon],
  templateUrl: './hk-qr-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkQrCard {
  readonly title = input.required<string>();
  // Ce que le QR encode : exactement ce lien, rien d'autre.
  readonly url = input.required<string>();
  // Nom des fichiers telecharges, sans extension : « menu-chez-hikky ».
  readonly fileName = input.required<string>();
  readonly description = input('');

  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);

  /**
   * Le dessin suit le lien : changer de lien relance la generation et abandonne
   * la precedente. C'est `resource` qui tient le fil, pas un compteur a la main,
   * donc un resultat en retard ne peut plus ecraser un lien plus recent.
   */
  private readonly images = resource<QrImages, string>({
    params: () => this.url(),
    loader: async ({ params: url }) => {
      // La bibliotheque n'est chargee qu'ici : elle ne pese pas sur le bundle initial.
      // Module CommonJS : en build de production, les fonctions sont sous « default ».
      const QRCode = resolveQrModule(await import('qrcode'));
      const svg = await QRCode.toString(url, { ...QR_OPTIONS, type: 'svg' });
      try {
        return { svg, png: await QRCode.toDataURL(url, { ...QR_OPTIONS, width: PNG_WIDTH }) };
      } catch {
        // Pas de canvas (tests, environnements restreints) : le SVG suffit a
        // l'affichage comme a l'impression, le bouton PNG reste simplement inactif.
        return { svg, png: null };
      }
    },
  });

  protected readonly svg = computed(() => this.images.value()?.svg ?? '');
  protected readonly png = computed(() => this.images.value()?.png ?? null);
  protected readonly failed = computed(() => this.images.error() !== undefined);

  // Le SVG sort de la bibliotheque qrcode a partir de NOTRE lien : il est sur par
  // construction, d'ou le contournement explicite de la sanitisation (Angular
  // refuse par defaut les data: SVG).
  protected readonly svgHref = computed<SafeUrl | null>(() =>
    this.svg()
      ? this.sanitizer.bypassSecurityTrustUrl(
          'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.svg()),
        )
      : null,
  );
  // data:image/png est accepte tel quel par la sanitisation d'Angular : pas de contournement.
  protected readonly pngHref = this.png;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
    });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
      this.copyFailed.set(false);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), COPIED_FEEDBACK_MS);
    } catch {
      this.copyFailed.set(true);
    }
  }
}

type QrModule = typeof import('qrcode');

// Selon le bundler, le module arrive avec ses fonctions a la racine (developpement) ou
// sous « default » (production, module CommonJS) : on prend celui qui a les fonctions.
function resolveQrModule(loaded: unknown): QrModule {
  const candidate = loaded as Partial<QrModule> & { default?: Partial<QrModule> };
  return typeof candidate.toDataURL === 'function'
    ? (candidate as QrModule)
    : (candidate.default as QrModule);
}
