import { Component, effect, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { RescheduleDay, RescheduleSlot } from '@core/models/reservation.model';

const INITIAL_SLOTS_VISIBLE = 6;

@Component({
  selector: 'hk-reservation-slot-picker',
  imports: [DatePipe, HlmIcon, NgIcon],
  providers: [provideIcons({ lucideChevronDown })],
  template: `
    <div class="flex flex-col gap-3">
      @for (day of days(); track day.date) {
        <div class="border-border bg-card rounded-lg border">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left"
            (click)="toggleDay(day.date)"
          >
            <span class="font-medium first-letter:uppercase">
              {{ day.date | date: 'EEEE d MMMM' : undefined : 'fr' }}
            </span>
            <ng-icon
              hlm
              size="sm"
              name="lucideChevronDown"
              class="transition-transform"
              [class.rotate-180]="isExpanded(day.date)"
            />
          </button>

          @if (isExpanded(day.date)) {
            @if (day.slots.length === 0) {
              <p class="text-muted-foreground px-4 pb-4 text-sm">
                Aucun créneau disponible ce jour-là.
              </p>
            } @else {
              <div class="grid grid-cols-3 gap-2 px-4 pb-4">
                @for (slot of visibleSlots(day); track slot.startsAt) {
                  <button
                    type="button"
                    class="rounded-md border px-3 py-2 text-sm font-medium transition-colors"
                    [class.border-border]="!isSelected(slot)"
                    [class.bg-background]="!isSelected(slot)"
                    [class.hover:bg-accent]="!isSelected(slot)"
                    [class.border-primary]="isSelected(slot)"
                    [class.bg-primary]="isSelected(slot)"
                    [class.text-primary-foreground]="isSelected(slot)"
                    (click)="pick(slot)"
                  >
                    {{ slot.startsAt | date: 'HH:mm' }}
                  </button>
                }
              </div>

              @if (day.slots.length > INITIAL_SLOTS_VISIBLE && !isFullyShown(day.date)) {
                <button
                  type="button"
                  class="border-border text-primary hover:bg-accent w-full border-t py-3 text-sm font-medium"
                  (click)="showAll(day.date)"
                >
                  Voir plus
                </button>
              }
            }
          }
        </div>
      }
    </div>
  `,
})
export class HkReservationSlotPicker {
  private autoExpanded = false;
  days = input.required<RescheduleDay[]>();
  // Créneau à préselectionner (typiquement le dateTime actuel de la resa).
  // Comparé par instant, donc l'offset (`Z` vs `+02:00`) n'a pas d'importance.
  initialSelectedStartsAt = input<string | null>(null);
  // Ouvre d'emblee le premier jour qui a des creneaux : le client voit tout de suite quelque chose
  // a choisir, meme quand la journee en cours est deja finie. Desactive par defaut (replanification).
  expandFirstAvailable = input(false);
  slotPicked = output<RescheduleSlot>();

  // Jours dépliés par leur date (YYYY-MM-DD). Tout replié par défaut ; seul le
  // jour de la resa d'origine est ouvert à l'arrivée (voir constructor).
  private expanded = signal<Set<string>>(new Set());
  // Jours pour lesquels "Voir plus" a été cliqué.
  private expandedAll = signal<Set<string>>(new Set());
  // Slot actuellement sélectionné. Stocké en millisecondes UTC pour être
  // indépendant du format d'écriture ISO (Z vs +02:00 = même instant).
  private selectedInstantMs = signal<number | null>(null);

  constructor() {
    // Sync la préselection quand le parent nous donne (ou change) la valeur initiale,
    // et pré-ouvre le jour correspondant pour que le client voie tout de suite "son" créneau.
    effect(() => {
      const initial = this.initialSelectedStartsAt();
      if (!initial) {
        this.selectedInstantMs.set(null);
        return;
      }
      const date = new Date(initial);
      this.selectedInstantMs.set(date.getTime());
      // Clé "YYYY-MM-DD" en heure locale (les `day.date` du back sont en local resto).
      const key = date.toLocaleDateString('sv-SE'); // sv-SE = format ISO YYYY-MM-DD
      this.expanded.update((set) => new Set(set).add(key));
    });
    // Une seule fois : un rechargement des creneaux ne rouvre pas un jour que le client a replie.
    effect(() => {
      if (!this.expandFirstAvailable() || this.autoExpanded) return;
      const first = this.days().find((d) => d.slots.length > 0);
      if (first) {
        this.autoExpanded = true;
        this.expanded.update((set) => new Set(set).add(first.date));
      }
    });
  }

  readonly INITIAL_SLOTS_VISIBLE = INITIAL_SLOTS_VISIBLE;

  isExpanded(date: string): boolean {
    return this.expanded().has(date);
  }

  isFullyShown(date: string): boolean {
    return this.expandedAll().has(date);
  }

  isSelected(slot: RescheduleSlot): boolean {
    const selected = this.selectedInstantMs();
    return selected !== null && new Date(slot.startsAt).getTime() === selected;
  }

  visibleSlots(day: RescheduleDay): RescheduleSlot[] {
    return this.isFullyShown(day.date) ? day.slots : day.slots.slice(0, INITIAL_SLOTS_VISIBLE);
  }

  toggleDay(date: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  showAll(date: string): void {
    this.expandedAll.update((set) => new Set(set).add(date));
  }

  pick(slot: RescheduleSlot): void {
    this.selectedInstantMs.set(new Date(slot.startsAt).getTime());
    this.slotPicked.emit(slot);
  }
}
