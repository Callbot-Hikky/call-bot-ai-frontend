import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
} from '@angular/core';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkInlineConfirm } from '@shared/components/molecules/inline-confirm/hk-inline-confirm';
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
  setItemPrice,
  updateItem,
  updateSection,
  validateManual,
  ManualSection,
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
  imports: [HkInput, HkButton, HkIcon, HlmTextarea, HkInlineConfirm],
  templateUrl: './hk-menu-manual-form.html',
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
  private readonly injector = inject(Injector);

  protected addSectionToMenu(): void {
    this.menu.set(addSection(this.menu(), ''));
    this.focusAfterRender(`section-name-${this.menu().sections.length - 1}`);
  }

  protected addItemTo(s: number): void {
    this.menu.set(addItem(this.menu(), s));
    this.focusAfterRender(`item-name-${s}-${this.menu().sections[s].items.length - 1}`);
  }

  // Le champ qui vient d'apparaitre recoit le focus : on enchaine la saisie sans
  // reprendre la souris. `afterNextRender` et non `setTimeout` : Angular garantit
  // que le champ est dans la page quand le rappel s'execute, au lieu de parier sur
  // l'ordre d'une file de taches. Les identifiants sont construits ici (lettres,
  // chiffres, tirets) : pas d'echappement a prevoir.
  private focusAfterRender(id: string): void {
    afterNextRender(
      // Phase « write » : donner le focus peut faire defiler la page, c'est une
      // ecriture. La phase par defaut melange lecture et ecriture et coute un
      // recalcul de mise en page inutile.
      { write: () => this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus() },
      { injector: this.injector },
    );
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
    this.menu.set(setItemPrice(this.menu(), s, i, value));
  }

  // A la sortie du champ : « 12,5 » devient « 12.50 ». Un prix deja propre ou
  // invalide n'est pas reemis, donc pas d'enregistrement pour rien.
  protected normalizePriceAt(s: number, i: number): void {
    const item = this.menu().sections[s]?.items[i];
    if (!item) return;
    const normalized = normalizePrice(item.price);
    if (normalized !== null && normalized !== item.price) {
      this.setItem(s, i, { price: normalized });
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

  /** Une suppression de section emporte ses plats : la question doit le dire. */
  protected sectionRemovalQuestion(section: ManualSection): string {
    const n = section.items.length;
    if (n === 0) return 'Supprimer cette section ?';
    return `Supprimer cette section et ${n === 1 ? 'son plat' : `ses ${n} plats`} ?`;
  }
}
