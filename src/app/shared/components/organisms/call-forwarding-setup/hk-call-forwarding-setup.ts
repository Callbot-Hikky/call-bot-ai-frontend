import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import {
  CANCEL_ALL_CODE,
  RING_SECONDS_CHOICES,
  activationCodes,
  cancellationCodes,
  formatDidForDisplay,
  mmiHref,
} from '@core/models/telephony.model';
import type { ForwardMode, ForwardingSetup, MmiCode } from '@core/models/telephony.model';

/**
 * Branchement du numéro : ce que le restaurateur compose pour connecter sa ligne
 * à l'assistant, et pour la débrancher.
 *
 * <p>Son numéro public ne change jamais — il reste celui de Google, de l'enseigne
 * et des cartes de visite. Un renvoi opérateur redirige ses appels vers le numéro
 * dédié que nous lui attribuons, invisible pour ses clients.
 *
 * <p>Sur mobile chaque code est un lien `tel:` : un tap l'active, sans recopie.
 */
@Component({
  selector: 'hk-call-forwarding-setup',
  imports: [HkButton, HkIcon],
  template: `
    <section class="border-border bg-card flex flex-col gap-5 rounded-lg border p-4 sm:p-5">
      <header class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <h2 class="text-foreground text-base font-semibold">Brancher votre numéro</h2>
          @if (setup(); as s) {
            @if (s.verifiedAt) {
              <span
                class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
              >
                Renvoi actif
              </span>
            } @else {
              <span class="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                Pas encore d’appel reçu
              </span>
            }
          }
        </div>
        <p class="text-muted-foreground text-sm">
          Votre numéro ne change pas. Vos clients continuent de composer celui qu’ils connaissent —
          nous lui rattachons une ligne dédiée qu’ils ne voient jamais.
        </p>
      </header>

      @if (loading()) {
        <p class="text-muted-foreground text-sm">Chargement…</p>
      } @else if (!setup()) {
        <!-- Pas de DID : le dire franchement plutôt que d'afficher un numéro inventé
             que le restaurateur composerait pour rien. -->
        <div class="border-border bg-muted/40 rounded-md border border-dashed p-4">
          <p class="text-foreground text-sm font-medium">Numéro en cours d’attribution</p>
          <p class="text-muted-foreground mt-1 text-sm">
            Votre ligne dédiée sera disponible ici sous 48 h. Vous recevrez un message dès qu’elle
            sera prête, et le branchement prend moins d’une minute.
          </p>
        </div>
      } @else if (setup(); as s) {
        <!-- 1. Le numéro dédié. -->
        <div
          class="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-md border p-3"
        >
          <div class="flex min-w-0 flex-col">
            <span class="text-muted-foreground text-xs">Votre ligne dédiée</span>
            <span class="text-foreground font-mono text-lg tabular-nums">
              {{ displayDid() }}
            </span>
          </div>
          <hk-button size="sm" variant="secondary" (click)="copy(s.did, 'did')">
            {{ copied() === 'did' ? 'Copié' : 'Copier' }}
          </hk-button>
        </div>

        <!-- 2. Le mode. -->
        <div class="flex flex-col gap-2">
          <span class="text-foreground text-sm font-medium">Quand l’assistant répond-il ?</span>
          @for (option of modes; track option.code) {
            <label
              class="border-border flex cursor-pointer items-start gap-3 rounded-md border p-3"
              [class.border-primary]="mode() === option.code"
            >
              <input
                type="radio"
                name="forward-mode"
                class="mt-1"
                [checked]="mode() === option.code"
                (change)="selectMode(option.code)"
              />
              <span class="flex flex-col gap-1">
                <span class="text-foreground text-sm font-medium">{{ option.label }}</span>
                <span class="text-muted-foreground text-xs">{{ option.hint }}</span>
              </span>
            </label>
          }

          @if (mode() === 'safety_net') {
            <label class="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              Laisser sonner
              <select
                class="border-border bg-card text-foreground rounded-md border px-2 py-1 text-sm"
                [value]="ringSeconds()"
                (change)="selectRing($any($event.target).value)"
              >
                @for (choice of ringChoices; track choice) {
                  <option [value]="choice">{{ choice }} s</option>
                }
              </select>
              avant que l’assistant prenne le relais
            </label>

            <!-- Piège vérifié en conditions réelles : au délai par défaut, c'est la
                 messagerie de l'opérateur qui récupère l'appel, pas l'assistant. -->
            <div class="flex items-start gap-2 rounded-md bg-amber-50 p-3">
              <hk-icon name="lucideTriangleAlert" [size]="16" class="mt-0.5 text-amber-700" />
              <p class="text-xs text-amber-900">
                <strong
                  >Au-delà de 15 secondes, votre messagerie vocale prend l’appel avant
                  l’assistant.</strong
                >
                Si vos appels partent toujours sur le répondeur, réduisez ce délai ou désactivez
                votre messagerie auprès de votre opérateur.
              </p>
            </div>
          }
        </div>

        <!-- 3. Brancher. -->
        <div class="flex flex-col gap-2">
          <span class="text-foreground text-sm font-medium">
            {{ activation().length > 1 ? 'Composez ces deux codes' : 'Composez ce code' }}
            sur le téléphone du restaurant
          </span>
          @for (item of activation(); track item.code) {
            <div class="border-border flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="text-muted-foreground text-xs">{{ item.label }}</span>
                <a
                  class="text-foreground font-mono text-sm break-all underline-offset-2 hover:underline"
                  [href]="href(item.code)"
                >
                  {{ item.code }}
                </a>
                @if (item.hint) {
                  <span class="text-muted-foreground mt-0.5 text-xs">{{ item.hint }}</span>
                }
              </div>
              <hk-button size="sm" variant="secondary" (click)="copy(item.code, item.code)">
                {{ copied() === item.code ? 'Copié' : 'Copier' }}
              </hk-button>
            </div>
          }
          <p class="text-muted-foreground text-xs">
            Tapez le code comme un numéro puis appuyez sur Appeler. Un message de confirmation
            s’affiche. Depuis un mobile, vous pouvez aussi toucher le code directement.
          </p>
        </div>

        <!-- 4. Débrancher. -->
        <details class="border-border rounded-md border p-3">
          <summary class="text-foreground cursor-pointer text-sm font-medium">
            Débrancher et reprendre mes appels
          </summary>
          <div class="mt-3 flex flex-col gap-2">
            @for (item of cancellation(); track item.code) {
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="text-muted-foreground text-xs">{{ item.label }}</span>
                  <a
                    class="text-foreground font-mono text-sm underline-offset-2 hover:underline"
                    [href]="href(item.code)"
                  >
                    {{ item.code }}
                  </a>
                </div>
                <hk-button size="sm" variant="secondary" (click)="copy(item.code, item.code)">
                  {{ copied() === item.code ? 'Copié' : 'Copier' }}
                </hk-button>
              </div>
            }
            <p class="text-muted-foreground text-xs">
              Vos appels reviennent immédiatement sur votre téléphone. Si vous ne savez plus ce qui
              est activé, <span class="font-mono">{{ cancelAll }}</span> annule tous les renvois de
              la ligne.
            </p>
          </div>
        </details>

        <!-- 5. Le chemin de secours. Les codes sont refusés chez certains opérateurs. -->
        <p class="text-muted-foreground text-xs">
          Le code est refusé ? Votre opérateur bloque peut-être cette saisie. Le même réglage existe
          dans son application ou votre espace client, sous « Renvoi d’appel ».
        </p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkCallForwardingSetup {
  readonly setup = input<ForwardingSetup | null>(null);
  readonly loading = input(false);

  /** Émis quand le restaurateur change de mode ou de délai, pour persistance. */
  readonly changed = output<{ mode: ForwardMode; ringSeconds: number }>();

  protected readonly cancelAll = CANCEL_ALL_CODE;
  protected readonly ringChoices = RING_SECONDS_CHOICES;

  protected readonly modes: readonly { code: ForwardMode; label: string; hint: string }[] = [
    {
      code: 'safety_net',
      label: 'Seulement si vous ne pouvez pas répondre',
      hint: 'Votre téléphone sonne d’abord. L’assistant ne prend que les appels que vous auriez manqués.',
    },
    {
      code: 'front_line',
      label: 'Sur tous les appels',
      hint: 'L’assistant décroche systématiquement et vous passe l’appel si le client le demande.',
    },
  ];

  /** Modifications locales tant que le restaurateur n'a pas rechargé la page. */
  private readonly modeOverride = signal<ForwardMode | null>(null);
  private readonly ringOverride = signal<number | null>(null);
  protected readonly copied = signal<string | null>(null);

  protected readonly mode = computed<ForwardMode>(
    () => this.modeOverride() ?? this.setup()?.mode ?? 'safety_net',
  );

  protected readonly ringSeconds = computed(
    () => this.ringOverride() ?? this.setup()?.ringSeconds ?? 10,
  );

  protected readonly displayDid = computed(() => formatDidForDisplay(this.setup()?.did ?? ''));

  protected readonly activation = computed<MmiCode[]>(() =>
    activationCodes(this.setup()?.did ?? '', this.mode(), this.ringSeconds()),
  );

  protected readonly cancellation = computed<MmiCode[]>(() => cancellationCodes(this.mode()));

  protected href(code: string): string {
    return mmiHref(code);
  }

  protected selectMode(mode: ForwardMode): void {
    this.modeOverride.set(mode);
    this.changed.emit({ mode, ringSeconds: this.ringSeconds() });
  }

  protected selectRing(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.ringOverride.set(parsed);
    this.changed.emit({ mode: this.mode(), ringSeconds: parsed });
  }

  protected copy(value: string, key: string): void {
    void navigator.clipboard?.writeText(value).then(() => {
      this.copied.set(key);
      setTimeout(() => this.copied.set(null), 2000);
    });
  }
}
