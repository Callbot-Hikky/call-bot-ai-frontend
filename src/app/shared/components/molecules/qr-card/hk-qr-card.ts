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
import * as QRCode from 'qrcode';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

// Un lien public et son QR code, prets a imprimer. Le QR est genere dans le
// navigateur, pure fonction du lien : rien n'est stocke ni calcule cote serveur.
// Le SVG (vectoriel, pour l'imprimeur) est toujours produit ; le PNG (pour un
// flyer, un reseau social) demande un canvas et n'existe donc que dans un vrai
// navigateur.
@Component({
  selector: 'hk-qr-card',
  imports: [HkButton, HkIcon],
  template: `
    <div
      class="bg-card border-border/70 flex flex-col gap-4 rounded-lg border p-4 shadow-sm sm:flex-row sm:items-start"
    >
      <div
        class="border-border/60 flex size-40 shrink-0 items-center justify-center self-center rounded-md border bg-white p-2 sm:self-start"
      >
        @if (png(); as src) {
          <img [src]="src" [alt]="'QR code : ' + title()" class="size-full" />
        } @else if (svgHtml(); as html) {
          <div class="size-full [&>svg]:size-full" [innerHTML]="html"></div>
        } @else {
          <span class="text-text-subtle text-xs">Génération du QR code…</span>
        }
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="flex flex-col gap-1">
          <p class="text-text-strong font-semibold">{{ title() }}</p>
          @if (description()) {
            <p class="text-text-subtle text-sm">{{ description() }}</p>
          }
        </div>
        <p
          class="text-text-muted bg-muted rounded-md px-2 py-1 font-mono text-xs break-all"
          data-testid="qr-url"
        >
          {{ url() }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <hk-button size="sm" variant="secondary" data-testid="copy-url" (click)="copy()">
            <hk-icon name="lucideCopy" [size]="14" />
            {{ copied() ? 'Lien copié' : 'Copier le lien' }}
          </hk-button>
          @if (pngHref(); as href) {
            <a
              data-testid="download-png"
              [href]="href"
              [download]="fileName() + '.png'"
              class="border-border bg-card text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-sm border px-3 text-sm font-medium"
            >
              <hk-icon name="lucideDownload" [size]="14" />
              PNG
            </a>
          } @else {
            <hk-button size="sm" variant="secondary" data-testid="download-png" [disabled]="true">
              <hk-icon name="lucideDownload" [size]="14" />
              PNG
            </hk-button>
          }
          @if (svgHref(); as href) {
            <a
              data-testid="download-svg"
              [href]="href"
              [download]="fileName() + '.svg'"
              class="border-border bg-card text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-sm border px-3 text-sm font-medium"
            >
              <hk-icon name="lucideDownload" [size]="14" />
              SVG
            </a>
          }
          <a
            data-testid="open-url"
            [href]="url()"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary inline-flex items-center gap-1 text-sm underline"
          >
            <hk-icon name="lucideExternalLink" [size]="14" />
            Ouvrir la page
          </a>
        </div>
        @if (copyFailed()) {
          <p class="text-st-cancelled-fg text-xs" role="alert">
            Copie impossible depuis ce navigateur. Sélectionnez le lien ci-dessus pour le copier.
          </p>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkQrCard {
  readonly title = input.required<string>();
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
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);
  // Ce que le QR encode : exactement le lien, rien d'autre.

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
    const options = { margin: 1, errorCorrectionLevel: 'M' as const };
    const svg = await QRCode.toString(url, { ...options, type: 'svg' });
    if (run !== this.generation) return;
    this.svg.set(svg);
    try {
      const png = await QRCode.toDataURL(url, { ...options, width: 512 });
      if (run === this.generation) this.png.set(png);
    } catch {
      // Pas de canvas (tests) : le SVG suffit a l'affichage et a l'impression.
      this.png.set(null);
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
      this.copyFailed.set(false);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copyFailed.set(true);
    }
  }
}
