import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkInput } from '@shared/components/atoms/input/hk-input';
import {
  MANUAL_LIMITS,
  ManualItem,
  normalizePrice,
  trimItem,
  ManualMenu,
  addItem,
  addSection,
  removeItem,
  removeSection,
  updateItem,
  updateSection,
  validateManual,
} from '@core/models/menu.model';

type PendingRemoval =
  | { type: 'section'; s: number }
  | { type: 'item'; s: number; i: number }
  | null;

// Saisie manuelle de la carte : sections, plats, prix. Le modele est immuable,
// chaque changement remonte par `menu` (model bidirectionnel). Le prix n'est
// normalise qu'a la sortie du champ, pas a chaque frappe. Suppression avec
// confirmation inline : jamais de dialogue bloquant.
@Component({
  selector: 'hk-menu-manual-form',
  imports: [HkInput, HkButton, HkIcon, HlmTextarea],
  template: `
    <div class="flex flex-col gap-6" [class.opacity-60]="disabled()">
      @for (section of menu().sections; track $index; let s = $index) {
        <section class="bg-card border-border/70 flex flex-col gap-4 rounded-lg border p-4">
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <label class="sr-only" [attr.for]="'section-name-' + s"
                >Nom de la section {{ s + 1 }}</label
              >
              <hk-input
                [attr.data-testid]="'section-name-' + s"
                [inputId]="'section-name-' + s"
                [value]="section.name"
                (valueChange)="setSectionName(s, $event)"
                (focusout)="trimSectionAt(s)"
                placeholder="Nom de la section (ex. Entrées, Plats, Desserts)"
                [disabled]="disabled()"
                [error]="section.name.trim() === ''"
              />
            </div>
            <span class="text-text-subtle text-xs whitespace-nowrap tabular-nums">
              {{ section.items.length }}/{{ limits.itemsPerSection }} plats
            </span>
            <hk-button
              variant="ghost"
              size="sm"
              [attr.data-testid]="'remove-section-' + s"
              [disabled]="disabled()"
              (click)="askRemoval({ type: 'section', s })"
            >
              <hk-icon name="lucideTrash2" [size]="16" />
              <span class="sr-only">Supprimer la section</span>
            </hk-button>
          </div>

          @if (isPending('section', s)) {
            <div
              class="bg-muted flex flex-wrap items-center gap-2 rounded-md p-3 text-sm"
              role="alert"
            >
              <span>Supprimer cette section et ses {{ section.items.length }} plat(s) ?</span>
              <hk-button
                variant="danger"
                size="sm"
                data-testid="confirm-remove"
                (click)="confirmRemoval()"
              >
                Supprimer
              </hk-button>
              <hk-button
                variant="secondary"
                size="sm"
                data-testid="cancel-remove"
                (click)="pending.set(null)"
              >
                Annuler
              </hk-button>
            </div>
          }

          @for (item of section.items; track $index; let i = $index) {
            <div class="border-border/60 flex flex-col gap-2 rounded-md border p-3">
              <div class="flex items-start gap-2">
                <div class="flex-1" [attr.data-testid]="'item-name-' + s + '-' + i">
                  <label class="sr-only" [attr.for]="'item-name-' + s + '-' + i"
                    >Nom du plat {{ i + 1 }}</label
                  >
                  <hk-input
                    [inputId]="'item-name-' + s + '-' + i"
                    [value]="item.name"
                    (valueChange)="setItem(s, i, { name: $event })"
                    (focusout)="trimAt(s, i)"
                    (keydown.enter)="onEnter($event, s)"
                    placeholder="Nom du plat"
                    [disabled]="disabled()"
                    [error]="item.name.trim() === ''"
                  />
                </div>
                <div class="w-28" [attr.data-testid]="'item-price-' + s + '-' + i">
                  <label class="sr-only" [attr.for]="'item-price-' + s + '-' + i"
                    >Prix du plat {{ i + 1 }}</label
                  >
                  <hk-input
                    [inputId]="'item-price-' + s + '-' + i"
                    [value]="item.price"
                    (valueChange)="setPriceRaw(s, i, $event)"
                    (focusout)="normalizePriceAt(s, i)"
                    placeholder="12.50"
                    [disabled]="disabled()"
                    [error]="hasInvalidPrice(item)"
                  />
                </div>
                <hk-button
                  variant="ghost"
                  size="sm"
                  [attr.data-testid]="'remove-item-' + s + '-' + i"
                  [disabled]="disabled()"
                  (click)="askRemoval({ type: 'item', s, i })"
                >
                  <hk-icon name="lucideX" [size]="16" />
                  <span class="sr-only">Supprimer le plat</span>
                </hk-button>
              </div>
              @if (isPending('item', s, i)) {
                <div
                  class="bg-muted flex flex-wrap items-center gap-2 rounded-md p-2 text-sm"
                  role="alert"
                >
                  <span>Supprimer ce plat ?</span>
                  <hk-button
                    variant="danger"
                    size="sm"
                    data-testid="confirm-remove"
                    (click)="confirmRemoval()"
                  >
                    Supprimer
                  </hk-button>
                  <hk-button variant="secondary" size="sm" (click)="pending.set(null)"
                    >Annuler</hk-button
                  >
                </div>
              }
              <label class="sr-only" [attr.for]="'item-desc-' + s + '-' + i"
                >Description du plat {{ i + 1 }}</label
              >
              <textarea
                hlmTextarea
                rows="2"
                [id]="'item-desc-' + s + '-' + i"
                (focusout)="trimAt(s, i)"
                [value]="item.description"
                (input)="setDescription(s, i, $event)"
                [attr.maxlength]="limits.description"
                [disabled]="disabled()"
                placeholder="Description (facultative)"
                class="text-sm"
              ></textarea>
              <span class="text-text-subtle self-end text-xs tabular-nums">
                {{ item.description.length }}/{{ limits.description }}
              </span>
            </div>
          }

          <hk-button
            variant="secondary"
            size="sm"
            [attr.data-testid]="'add-item-' + s"
            [disabled]="disabled() || section.items.length >= limits.itemsPerSection"
            (click)="addItemTo(s)"
          >
            <hk-icon name="lucidePlus" [size]="14" />
            Ajouter un plat
          </hk-button>
        </section>
      } @empty {
        <p class="text-text-subtle text-sm">
          Aucune section pour l'instant. Commencez par « Ajouter une section », puis vos plats.
        </p>
      }

      <div>
        <hk-button
          variant="secondary"
          data-testid="add-section"
          [disabled]="disabled() || !canAddSection()"
          (click)="addSectionToMenu()"
        >
          <hk-icon name="lucidePlus" [size]="16" />
          Ajouter une section
        </hk-button>
        @if (!canAddSection()) {
          <span class="text-text-subtle ml-3 text-xs">{{ limits.sections }} sections maximum.</span>
        }
      </div>

      @if (errors().length > 0) {
        <ul
          class="text-st-cancelled-fg flex flex-col gap-1 text-sm"
          data-testid="manual-errors"
          role="alert"
        >
          @for (error of errors(); track error) {
            <li>{{ error }}</li>
          }
        </ul>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkMenuManualForm {
  readonly menu = model.required<ManualMenu>();
  readonly disabled = input(false);

  protected readonly limits = MANUAL_LIMITS;
  protected readonly pending = signal<PendingRemoval>(null);
  protected readonly errors = computed(() => validateManual(this.menu()));
  protected readonly canAddSection = computed(
    () => this.menu().sections.length < MANUAL_LIMITS.sections,
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected addSectionToMenu(): void {
    this.menu.set(addSection(this.menu(), ''));
    this.focusAfterRender(`section-name-${this.menu().sections.length - 1}`);
  }

  protected addItemTo(s: number): void {
    this.menu.set(addItem(this.menu(), s));
    this.focusAfterRender(`item-name-${s}-${this.menu().sections[s].items.length - 1}`);
  }

  // Le champ qui vient d'apparaitre recoit le focus : on enchaine la saisie sans reprendre la souris.
  // Les identifiants sont construits ici (lettres, chiffres, tirets) : pas d'echappement a prevoir.
  private focusAfterRender(id: string): void {
    setTimeout(() => {
      this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus();
    });
  }

  protected setSectionName(s: number, name: string): void {
    this.menu.set(updateSection(this.menu(), s, name));
  }

  protected setItem(s: number, i: number, patch: Partial<ManualItem>): void {
    this.menu.set(updateItem(this.menu(), s, i, patch));
  }

  protected setDescription(s: number, i: number, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value.slice(0, MANUAL_LIMITS.description);
    this.setItem(s, i, { description: value });
  }

  // Pendant la frappe on garde la valeur brute (sinon « 18. » serait rejete a
  // chaque touche) ; la normalisation se fait a la sortie du champ.
  protected setPriceRaw(s: number, i: number, value: string): void {
    this.menu.set({
      ...this.menu(),
      sections: this.menu().sections.map((section, si) =>
        si !== s
          ? section
          : {
              ...section,
              items: section.items.map((item, ii) => (ii === i ? { ...item, price: value } : item)),
            },
      ),
    });
  }

  // A la sortie du champ. Un modele identique n'est pas reemis : pas d'enregistrement pour rien.
  protected normalizePriceAt(s: number, i: number): void {
    const item = this.menu().sections[s]?.items[i];
    if (item && normalizePrice(item.price) !== null && normalizePrice(item.price) !== item.price) {
      this.setItem(s, i, { price: item.price });
    }
  }

  protected trimAt(s: number, i: number): void {
    const item = this.menu().sections[s]?.items[i];
    if (item && (item.name !== item.name.trim() || item.description !== item.description.trim())) {
      this.menu.set(trimItem(this.menu(), s, i));
    }
  }

  protected trimSectionAt(s: number): void {
    const section = this.menu().sections[s];
    if (section && section.name !== section.name.trim()) {
      this.setSectionName(s, section.name.trim());
    }
  }

  protected hasInvalidPrice(item: ManualItem): boolean {
    return item.price !== '' && normalizePrice(item.price) === null;
  }

  protected onEnter(event: Event, s: number): void {
    event.preventDefault();
    if (!this.disabled()) {
      this.addItemTo(s);
    }
  }

  protected askRemoval(target: PendingRemoval): void {
    this.pending.set(target);
  }

  protected isPending(type: 'section' | 'item', s: number, i?: number): boolean {
    const p = this.pending();
    if (!p || p.type !== type || p.s !== s) return false;
    return type === 'section' || (p.type === 'item' && p.i === i);
  }

  protected confirmRemoval(): void {
    const p = this.pending();
    if (!p) return;
    this.menu.set(
      p.type === 'section' ? removeSection(this.menu(), p.s) : removeItem(this.menu(), p.s, p.i),
    );
    this.pending.set(null);
  }
}
