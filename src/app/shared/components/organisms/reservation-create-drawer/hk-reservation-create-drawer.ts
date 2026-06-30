import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { TableService } from '@core/services/table.service';
import { NewReservationPayload } from '@core/models/reservation.model';

// Drawer (depuis la droite) pour créer une réservation manuellement.
// Émet `create` avec un payload validé ; la transformation en ReservationRequest
// (restaurantId, source, status) reste de la responsabilité du parent.
@Component({
  selector: 'hk-reservation-create-drawer',
  imports: [...HlmSheetImports, BrnSheetContent, ReactiveFormsModule, FormsModule, HkButton],
  template: `
    <hlm-sheet side="right" [state]="state()" (stateChanged)="state.set($event)">
      <hlm-sheet-content *brnSheetContent class="w-full p-0 sm:max-w-md">
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex h-full flex-col">
          <div class="border-border/70 border-b p-6">
            <h2 class="text-text-strong text-xl font-semibold">Nouvelle réservation</h2>
            <p class="text-text-muted mt-1 text-sm">
              Renseigne les informations du client et du créneau.
            </p>
          </div>

          <div class="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            <!-- Nom du client -->
            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">Nom du client</span>
              <input
                type="text"
                formControlName="customerName"
                placeholder="ex. Alice Martin"
                class="border-border focus:border-primary focus:ring-primary/30 bg-card h-9 rounded-sm border px-3 text-sm outline-none focus:ring-2"
              />
            </label>

            <!-- Téléphone -->
            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">Téléphone</span>
              <input
                type="tel"
                formControlName="phone"
                placeholder="+33 6 00 00 00 00"
                class="border-border focus:border-primary focus:ring-primary/30 bg-card h-9 rounded-sm border px-3 text-sm outline-none focus:ring-2"
              />
            </label>

            <!-- Date + Heure -->
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1.5">
                <span class="text-text-strong text-sm font-medium">Date</span>
                <input
                  type="date"
                  formControlName="date"
                  class="border-border focus:border-primary focus:ring-primary/30 bg-card h-9 rounded-sm border px-3 text-sm outline-none focus:ring-2"
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-text-strong text-sm font-medium">Heure</span>
                <input
                  type="time"
                  formControlName="startTime"
                  class="border-border focus:border-primary focus:ring-primary/30 bg-card h-9 rounded-sm border px-3 text-sm outline-none focus:ring-2"
                />
              </label>
            </div>

            <!-- Durée + Couverts -->
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1.5">
                <span class="text-text-strong text-sm font-medium">Durée</span>
                <select
                  formControlName="durationMinutes"
                  class="border-border focus:border-primary focus:ring-primary/30 bg-card h-9 rounded-sm border px-3 text-sm outline-none focus:ring-2"
                >
                  <option [ngValue]="60">1 h</option>
                  <option [ngValue]="90">1 h 30</option>
                  <option [ngValue]="120">2 h</option>
                  <option [ngValue]="150">2 h 30</option>
                  <option [ngValue]="180">3 h</option>
                </select>
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-text-strong text-sm font-medium">Couverts</span>
                <input
                  type="number"
                  min="1"
                  formControlName="partySize"
                  class="border-border focus:border-primary focus:ring-primary/30 bg-card h-9 rounded-sm border px-3 text-sm outline-none focus:ring-2"
                />
              </label>
            </div>

            <!-- Table (optionnelle, dépend de l'API "tables disponibles") -->
            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">
                Table <span class="text-text-muted font-normal">(optionnel)</span>
              </span>
              <select
                formControlName="tableId"
                [disabled]="!hasSlot()"
                class="border-border focus:border-primary focus:ring-primary/30 bg-card h-9 rounded-sm border px-3 text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option [ngValue]="null">— Pas de table assignée —</option>
                @for (t of tables.available(); track t.id) {
                  <option [ngValue]="t.id">{{ t.name }} ({{ t.capacity }} pl.)</option>
                }
              </select>
              @if (!hasSlot()) {
                <span class="text-text-muted text-xs">
                  Choisis d'abord la date, l'heure et la durée pour voir les tables disponibles.
                </span>
              } @else if (tables.loading()) {
                <span class="text-text-muted text-xs">Chargement des tables…</span>
              } @else if (tables.available().length === 0) {
                <span class="text-st-cancelled-fg text-xs">
                  Aucune table libre sur ce créneau.
                </span>
              }
            </label>

            <!-- Notes -->
            <label class="flex flex-col gap-1.5">
              <span class="text-text-strong text-sm font-medium">
                Notes <span class="text-text-muted font-normal">(optionnel)</span>
              </span>
              <textarea
                formControlName="notes"
                rows="3"
                placeholder="Allergies, occasion, demande spéciale..."
                class="border-border focus:border-primary focus:ring-primary/30 bg-card rounded-sm border px-3 py-2 text-sm outline-none focus:ring-2"
              ></textarea>
            </label>
          </div>

          <div class="border-border/70 flex items-center justify-end gap-2 border-t p-6">
            <hk-button variant="secondary" type="button" (click)="state.set('closed')">
              Annuler
            </hk-button>
            <hk-button type="submit" [disabled]="form.invalid">Créer</hk-button>
          </div>
        </form>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkReservationCreateDrawer {
  private readonly fb = inject(FormBuilder);
  protected readonly tables = inject(TableService);

  readonly state = model<BrnDialogState>('closed');
  readonly create = output<NewReservationPayload>();

  protected readonly form = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required]],
    date: ['', [Validators.required]],
    startTime: ['', [Validators.required]],
    durationMinutes: [120, [Validators.required, Validators.min(15)]],
    partySize: [2, [Validators.required, Validators.min(1)]],
    tableId: [null as string | null],
    notes: [''],
  });

  // Reflète les valeurs de date+heure+durée+couverts pour déclencher
  // le rechargement des tables disponibles dans un effect().
  private readonly slot = signal<{
    date: string;
    startTime: string;
    durationMinutes: number;
    partySize: number;
  }>({ date: '', startTime: '', durationMinutes: 120, partySize: 2 });

  protected readonly hasSlot = (): boolean => {
    const s = this.slot();
    return !!s.date && !!s.startTime && s.durationMinutes > 0;
  };

  constructor() {
    // On surveille uniquement les 4 champs qui définissent le créneau,
    // pour ne pas relancer l'API à chaque frappe dans 'notes' ou 'customerName'.
    const syncSlot = (): void => {
      const v = this.form.getRawValue();
      this.slot.set({
        date: v.date,
        startTime: v.startTime,
        durationMinutes: v.durationMinutes,
        partySize: v.partySize,
      });
    };
    this.form.controls.date.valueChanges.subscribe(syncSlot);
    this.form.controls.startTime.valueChanges.subscribe(syncSlot);
    this.form.controls.durationMinutes.valueChanges.subscribe(syncSlot);
    this.form.controls.partySize.valueChanges.subscribe(syncSlot);

    // Recharge les tables disponibles dès que le créneau change.
    effect(() => {
      const s = this.slot();
      if (!s.date || !s.startTime || s.durationMinutes <= 0) {
        this.tables.clear();
        return;
      }
      const { startsAt, endsAt } = this.combineToIso(s.date, s.startTime, s.durationMinutes);
      this.tables.loadAvailable(startsAt, endsAt, s.partySize || undefined);
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const { startsAt, endsAt } = this.combineToIso(v.date, v.startTime, v.durationMinutes);
    this.create.emit({ ...v, startsAt, endsAt });
    this.form.reset({
      customerName: '',
      phone: '',
      date: '',
      startTime: '',
      durationMinutes: 120,
      partySize: 2,
      tableId: null,
      notes: '',
    });
    this.state.set('closed');
  }

  // Combine 'YYYY-MM-DD' + 'HH:mm' + durée minutes -> { startsAt, endsAt } ISO 8601.
  // Le navigateur applique son fuseau local, et toISOString() convertit en UTC ('Z').
  private combineToIso(
    date: string,
    time: string,
    durationMinutes: number,
  ): { startsAt: string; endsAt: string } {
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    return { startsAt: start.toISOString(), endsAt: end.toISOString() };
  }
}
