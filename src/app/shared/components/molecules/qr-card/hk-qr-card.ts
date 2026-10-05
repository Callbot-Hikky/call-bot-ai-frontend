import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml, SafeUrl } from '@angular/platform-browser';
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
  private generation = 0;

  protected readonly svg = signal('');
  protected readonly png = signal<string | null>(null);
  protected readonly failed = signal(false);
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);

  // Le SVG et le PNG sortent de la bibliotheque qrcode a partir de NOTRE lien :
  // ils sont surs par construction, d'ou le contournement explicite de la
  // sanitisation (Angular refuse par defaut les data: SVG et le HTML inline).
  protected readonly svgHtml = computed<SafeHtml | null>(() =>
    this.svg() ? this.sanitizer.bypassSecurityTrustHtml(this.svg()) : null,
  );
  protected readonly svgHref = computed<SafeUrl | null>(() =>
    this.svg()
      ? this.sanitizer.bypassSecurityTrustUrl(
          'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.svg()),
        )
      : null,
  );
  // data:image/png est accepte tel quel par la sanitisation d'Angular : pas de contournement.
  protected readonly pngHref = computed<string | null>(() => this.png());

  constructor() {
    effect(() => {
      const url = this.url();
      if (url) {
        void this.generate(url);
      }
    });
    this.destroyRef.onDestroy(() => {
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
    });
  }

  // Un lien change pendant la generation : seul le dernier resultat est garde.
  private async generate(url: string): Promise<void> {
    const run = ++this.generation;
    // Le PNG du lien precedent part tout de suite. Le SVG est peint avant que le
    // PNG soit pret : sans ca, le bouton « telecharger en PNG » servirait le QR de
    // l'ancien lien pendant que l'ecran affiche deja le nouveau.
    this.png.set(null);
    // Niveau « M » : environ 15 % du dessin peut etre abime sans empecher la lecture.
    // C'est le bon compromis pour un code pose sur une table de restaurant ; « L » (7 %)
    // est trop fragile, « H » (30 %) densifie le motif et impose de l'imprimer plus grand.
    // Marge reduite a 1 module au lieu de 4 : la carte apporte deja son propre blanc.
    const options = { margin: 1, errorCorrectionLevel: 'M' as const };
    // La bibliotheque n'est chargee qu'ici : elle ne pese pas sur le bundle initial.
    // Module CommonJS : en build de production, les fonctions sont sous « default ».
    const loaded: unknown = await import('qrcode');
    const QRCode = resolveQrModule(loaded);
    let svg: string;
    try {
      svg = await QRCode.toString(url, { ...options, type: 'svg' });
    } catch {
      if (run === this.generation) this.failed.set(true);
      return;
    }
    if (run !== this.generation) return;
    this.failed.set(false);
    this.svg.set(svg);
    try {
      // 512 px : assez net pour une publication sur un reseau social, assez leger
      // pour tenir dans une data: URL sans alourdir la page.
      const png = await QRCode.toDataURL(url, { ...options, width: 512 });
      if (run === this.generation) this.png.set(png);
    } catch {
      // Pas de canvas (tests) : le SVG suffit a l'affichage et a l'impression.
      // Meme garde que les autres branches : un echec tardif d'une generation
      // abandonnee ne doit pas effacer le PNG d'un lien plus recent.
      if (run === this.generation) this.png.set(null);
    }
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
  if (typeof candidate.toDataURL === 'function') {
    return candidate as QrModule;
  }
  return candidate.default as QrModule;
}
