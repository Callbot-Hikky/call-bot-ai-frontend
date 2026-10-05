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

  /** Une suppression de section emporte ses plats : la question doit le dire. */
  protected sectionRemovalQuestion(section: ManualSection): string {
    const n = section.items.length;
    if (n === 0) return 'Supprimer cette section ?';
    return `Supprimer cette section et ${n === 1 ? 'son plat' : `ses ${n} plats`} ?`;
  }
}
