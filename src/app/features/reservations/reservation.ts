import { Component, OnInit, effect, input, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { delay, of, switchMap } from 'rxjs';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { ReservationService } from '@core/services/reservation.service';
import { RescheduleDay, RescheduleSlot, Reservation } from '@core/models/reservation.model';
import { HkReservationSlotPicker } from '@shared/components/organisms/reservation-slot-picker/hk-reservation-slot-picker';
import { HkCounter } from '@shared/components/molecules/counter/hk-counter';

const MIN_PARTY_SIZE = 1;
const MAX_PARTY_SIZE = 20;

@Component({
  selector: 'app-reservation',
  imports: [
    DatePipe,
    FormsModule,
    HkReservationSlotPicker,
    HkCounter,
    ...HlmSheetImports,
    BrnSheetContent,
    HlmButton,
  ],
  template: `
    <div class="flex flex-col gap-10">
      <h1 class="text-xl font-bold">
        {{ reservation()?.restaurant?.name || 'Nom du restaurant' }}
      </h1>

      <div class="flex flex-col gap-4">
        <p class="font-bold">
          <span class="text-primary">1. </span>Récapitulatif de votre réservation
        </p>

        <div class="flex flex-col gap-2">
          <p>
            <span class="font-medium">Au nom de :</span>
            {{ reservation()?.customerName || 'le frère' }}
          </p>
          <p>
            <span class="font-medium">Date :</span>
            {{ (reservation()?.dateTime | date: 'EEEE d MMMM à HH:mm') || 'date' }}
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <p class="font-bold"><span class="text-primary">2. </span>Combien de personnes ?</p>

        <hk-counter [(value)]="partySize" [min]="MIN_PARTY_SIZE" [max]="MAX_PARTY_SIZE" />
      </div>

      <div class="flex flex-col gap-4">
        <p class="font-bold"><span class="text-primary">3. </span>Choisissez un autre créneau</p>

        <hk-reservation-slot-picker
          [days]="days() ?? []"
          [initialSelectedStartsAt]="reservation()?.dateTime ?? null"
          (slotPicked)="onSlotPicked($event)"
        />
      </div>
    </div>

    <hlm-sheet side="bottom" [state]="sheetState()" (stateChanged)="sheetState.set($event)">
      <hlm-sheet-content
        *hlmSheetPortal="let ctx"
        class="!h-[90vh] w-full overflow-y-auto rounded-t-2xl p-6"
      >
        <div class="flex flex-col gap-8">
          <h1 hlmSheetTitle class="text-xl font-bold">
            {{ reservation()?.restaurant?.name || 'Nom du restaurant' }}
          </h1>

          <div class="flex flex-col gap-2">
            <p class="font-bold"><span class="text-primary">2. </span>Nombre de personnes</p>
            <p>{{ partySize() }} personne{{ partySize() > 1 ? 's' : '' }}</p>
          </div>

          <div class="flex flex-col gap-2">
            <p class="font-bold"><span class="text-primary">3. </span>Choisissez un créneau</p>
            <p>
              {{ pickedSlot()?.startsAt | date: 'EEEE d MMMM à HH:mm' }}
            </p>
          </div>

          <div class="flex flex-col gap-4">
            <p class="font-bold"><span class="text-primary">4. </span>Vos informations</p>

            <label class="flex flex-col gap-2">
              <span class="text-sm font-medium">Nom</span>
              <input
                type="text"
                class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                [(ngModel)]="newName"
              />
            </label>

            <label class="flex flex-col gap-2">
              <span class="text-sm font-medium">Notes</span>
              <textarea
                rows="3"
                placeholder="Allergies, occasion spéciale…"
                class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                [(ngModel)]="newNotes"
              ></textarea>
            </label>
          </div>

          @if (submitError(); as err) {
            <p class="text-destructive text-sm">{{ err }}</p>
          }

          <button
            hlmBtn
            size="lg"
            class="w-full py-6 text-base font-semibold"
            [disabled]="submitting()"
            (click)="confirm()"
          >
            {{ submitting() ? 'Confirmation…' : 'Confirmer' }}
          </button>
        </div>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
export class ReservationPage implements OnInit {
  private service = inject(ReservationService);
  private router = inject(Router);

  readonly MIN_PARTY_SIZE = MIN_PARTY_SIZE;
  readonly MAX_PARTY_SIZE = MAX_PARTY_SIZE;

  id = input<string>();

  reservation = signal<Reservation | null>(null);
  days = signal<RescheduleDay[] | null>(null);
  partySize = signal<number>(1);

  // État de la sheet de confirmation. Bindé à hlm-sheet via [state] / (stateChanged).
  sheetState = signal<BrnDialogState>('closed');
  // Slot que le user vient de cliquer — affiché dans la sheet.
  pickedSlot = signal<RescheduleSlot | null>(null);
  // Champs éditables dans la sheet (préremplis à l'ouverture).
  newName = signal<string>('');
  newNotes = signal<string>('');
  // Anti double-clic pendant l'appel HTTP de confirmation.
  submitting = signal<boolean>(false);
  // Message d'erreur affiché au user si la confirmation échoue (créneau pris entre-temps par ex.).
  submitError = signal<string | null>(null);

  private partySizeInitialized = false;

  constructor() {
    effect(() => {
      const r = this.reservation();
      if (r && !this.partySizeInitialized) {
        this.partySize.set(r.partySize);
        this.partySizeInitialized = true;
      }
    });

    effect(() => {
      const id = this.id();
      const size = this.partySize();
      if (!id || !this.partySizeInitialized) {
        return;
      }
      this.service.getRescheduleSlots(id, undefined, size).subscribe({
        next: (r) => this.days.set(r.days),
        error: (err) => console.error('reschedule-slots failed', err),
      });
    });
  }

  ngOnInit() {
    const id = this.id();
    if (id) {
      this.service.getReservationById(id).subscribe((r) => this.reservation.set(r));
    }
  }

  onSlotPicked(slot: RescheduleSlot): void {
    this.pickedSlot.set(slot);
    this.newName.set(this.reservation()?.customerName ?? '');
    this.newNotes.set(this.reservation()?.notes ?? '');
    this.submitError.set(null);
    this.sheetState.set('open');
  }

  confirm(): void {
    const slot = this.pickedSlot();
    const resa = this.reservation();
    const id = this.id();
    if (!slot || !resa || !id) {
      return;
    }

    const newName = this.newName().trim();
    const nameChanged = newName.length > 0 && newName !== resa.customerName;
    const nameUpdate$ =
      nameChanged && resa.customerId
        ? this.service.updateCustomerName(resa.customerId, newName)
        : of(void 0);

    this.submitting.set(true);
    this.submitError.set(null);

    nameUpdate$
      .pipe(
        switchMap(() =>
          this.service.reschedule(id, {
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            tableId: slot.tableId,
            partySize: this.partySize(),
            notes: this.newNotes(),
          }),
        ),
        delay(500),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.sheetState.set('closed');
          this.router.navigate(['/client/reservations', id, 'confirmed']);
        },
        error: (err) => {
          this.submitting.set(false);
          if (err?.status === 409 && err.error?.code === 'table_overlap') {
            this.submitError.set("Ce créneau vient d'être pris. Merci d'en choisir un autre.");
            this.service.getRescheduleSlots(id, undefined, this.partySize()).subscribe({
              next: (r) => this.days.set(r.days),
            });
          } else {
            this.submitError.set(
              'Une erreur est survenue. Merci de réessayer dans quelques instants.',
            );
          }
        },
      });
  }
}
