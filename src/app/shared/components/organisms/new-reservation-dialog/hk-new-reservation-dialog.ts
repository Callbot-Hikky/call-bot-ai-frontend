import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { formatDayLabel, formatTime, localDateKey, openNativePicker } from '@core/utils/format';

// Donnees saisies pour une reservation manuelle (le telephone est requis : le
// back cree un client, et c'est la cle de rappel du restaurateur).
export interface NewReservationInput {
  firstName: string;
  phone: string;
  dateTime: Date;
  partySize: number;
  notes: string | null;
}

// DIALOG « Nouvelle réservation » : la prise MANUELLE (telephone coupe, client
// au comptoir) complete la prise automatique par le bot. La resa est creee SANS
// table : elle arrive dans « Réservations non placées » et le plan (placement
// auto, fusion guidee) la place en un clic.
@Component({
  selector: 'hk-new-reservation-dialog',
  imports: [...HlmSheetImports, BrnSheetContent, HkButton, HkIcon],
  template: `
    <hlm-sheet side="right" [state]="state()" (stateChanged)="state.set($event)">
      <hlm-sheet-content *brnSheetContent class="w-full p-0 sm:max-w-md">
        <form class="flex h-full flex-col" (submit)="submit($event)">
          <div class="border-border/70 flex items-center gap-3 border-b p-6">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700"
            >
              <hk-icon name="lucideCalendar" [size]="20" />
            </span>
            <div class="flex flex-col">
              <h2 class="text-text-strong text-lg font-semibold">Nouvelle réservation</h2>
              <p class="text-text-subtle text-xs">
                Créée sans table : placez-la ensuite depuis le plan de salle.
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-4 overflow-y-auto p-6">
            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">Nom du client</span>
              <input
                type="text"
                data-testid="new-resa-name"
                class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                placeholder="Marie Dupont"
                [value]="firstName()"
                (input)="firstName.set(asValue($event))"
              />
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">
                Téléphone
                <span class="text-st-cancelled-fg">*</span>
              </span>
              <input
                type="tel"
                required
                data-testid="new-resa-phone"
                class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                placeholder="+33 6 12 34 56 78"
                [value]="phone()"
                (input)="phone.set(asValue($event))"
              />
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">
                Date
                <span class="text-text-subtle font-normal">({{ dayLabel() }})</span>
              </span>
              <input
                type="date"
                required
                data-testid="new-resa-date"
                class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                [value]="date()"
                [min]="today"
                (click)="openPicker($event)"
                (input)="onDate($event)"
              />
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1.5">
                <span class="text-text-strong text-sm font-medium">Heure</span>
                <input
                  type="time"
                  required
                  data-testid="new-resa-time"
                  class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                  [value]="time()"
                  (input)="time.set(asValue($event))"
                />
                @if (timeInPast()) {
                  <span class="text-st-cancelled-fg text-xs" data-testid="new-resa-past">
                    Cette heure est déjà passée.
                  </span>
                }
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-text-strong text-sm font-medium">Couverts</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  required
                  data-testid="new-resa-size"
                  class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-right font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                  [value]="partySize()"
                  (input)="onSize($event)"
                />
              </label>
            </div>

            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">Note (optionnel)</span>
              <input
                type="text"
                data-testid="new-resa-notes"
                class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                placeholder="Anniversaire, terrasse, chaise bébé…"
                [value]="notes()"
                (input)="notes.set(asValue($event))"
              />
            </label>
          </div>

          <div class="border-border/70 mt-auto flex flex-col gap-2 border-t p-6">
            <hk-button type="submit" data-testid="new-resa-submit" [disabled]="!valid() || busy()">
              {{ busy() ? 'Création…' : 'Créer la réservation' }}
            </hk-button>
            <hk-button type="button" variant="secondary" (click)="state.set('closed')">
              Annuler
            </hk-button>
          </div>
        </form>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkNewReservationDialog {
  readonly state = model<BrnDialogState>('closed');
  // Creation en cours (pilotee par la page) : desactive le submit -> pas de
  // double envoi si on clique deux fois avant la reponse reseau.
  readonly busy = input(false);
  // Jour propose a l'ouverture : celui que la page affiche (cle « YYYY-MM-DD »).
  // La date reste modifiable dans le formulaire : on prend une reservation pour
  // lundi sans avoir a changer le jour consulte.
  readonly day = input<string>(localDateKey());
  readonly createReservation = output<NewReservationInput>();

  protected readonly today = localDateKey();
  protected readonly date = signal(localDateKey());
  protected readonly dayLabel = computed(() => {
    const d = this.date();
    return d === this.today ? "aujourd'hui" : formatDayLabel(d);
  });

  constructor() {
    // Champs REINITIALISES a l'ouverture (pas au submit : en cas d'echec de
    // creation, le dialog reste ouvert avec la saisie intacte pour corriger).
    effect(() => {
      if (this.state() === 'open') {
        this.firstName.set('');
        this.phone.set('');
        this.notes.set('');
        this.partySize.set(2);
        // Un jour passe consulte ne propose pas une date passee : on part d'aujourd'hui.
        this.date.set(this.day() < this.today ? this.today : this.day());
        this.time.set(defaultTime());
      }
    });
  }

  protected readonly firstName = signal('');
  protected readonly phone = signal('');
  protected readonly time = signal(defaultTime());
  protected readonly partySize = signal(2);
  protected readonly notes = signal('');

  // Heure choisie ANTERIEURE a maintenant, sur la date choisie : une reservation
  // dans le passe n'a pas de sens. Recalcule a chaque frappe (lit l'heure courante
  // a la volee) - suffisant pour une saisie interactive.
  protected readonly timeInPast = computed(() => {
    const t = this.time();
    if (!/^\d{2}:\d{2}$/.test(t) || !this.dateValid()) {
      return false;
    }
    return this.dateTimeFor(t).getTime() < Date.now();
  });

  private dateTimeFor(time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const [y, m, d] = this.date().split('-').map(Number);
    return new Date(y, m - 1, d, hours, minutes, 0, 0);
  }

  protected readonly dateValid = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(this.date()));

  protected readonly valid = computed(
    () =>
      this.phone().trim().length >= 6 &&
      this.dateValid() &&
      /^\d{2}:\d{2}$/.test(this.time()) &&
      !this.timeInPast(),
  );

  protected openPicker(event: Event): void {
    openNativePicker(event.target as HTMLInputElement);
  }

  protected onDate(event: Event): void {
    this.date.set((event.target as HTMLInputElement).value);
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onSize(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) {
      this.partySize.set(Math.max(1, Math.min(99, Math.round(raw))));
    }
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.valid() || this.busy()) {
      return;
    }
    const dateTime = this.dateTimeFor(this.time());
    this.createReservation.emit({
      firstName: this.firstName().trim(),
      phone: this.phone().trim(),
      dateTime,
      partySize: this.partySize(),
      notes: this.notes().trim() || null,
    });
  }
}

// Prochaine heure PLEINE, bornee a la journee : apres 23 h on propose 23:30
// plutot que de basculer sur 00:00 (heure passee sur la date proposee).
function defaultTime(): string {
  const now = new Date();
  const d = new Date(now);
  d.setHours(d.getHours() + 1, 0, 0, 0);
  if (d.getDate() !== now.getDate()) {
    d.setTime(now.getTime());
    d.setHours(23, 30, 0, 0);
  }
  return formatTime(d.toISOString());
}
