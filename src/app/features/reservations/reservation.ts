import { Component, DestroyRef, effect, input, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { ReservationService } from '@core/services/reservation.service';
import { Title } from '@angular/platform-browser';
import {
  BOOKING_MAX_PARTY_SIZE,
  PublicReservation,
  RescheduleDay,
  RescheduleSlot,
} from '@core/models/reservation.model';
import { HkReservationSlotPicker } from '@shared/components/organisms/reservation-slot-picker/hk-reservation-slot-picker';
import { HkCounter } from '@shared/components/molecules/counter/hk-counter';
import { HkClientHeader } from '@shared/components/molecules/client-header/hk-client-header';

const MIN_PARTY_SIZE = 1;
// Aligne sur le back (BookingPolicy.MAX_PARTY_SIZE) : au-dela, l'API refuse.
const MAX_PARTY_SIZE = BOOKING_MAX_PARTY_SIZE;

@Component({
  selector: 'app-reservation',
  imports: [
    DatePipe,
    FormsModule,
    HkReservationSlotPicker,
    HkCounter,
    HkClientHeader,
    ...HlmSheetImports,
    BrnSheetContent,
    HlmButton,
    RouterLink,
  ],
  template: `
    @if (loadError(); as err) {
      <div class="flex flex-col items-center gap-3 py-16 text-center">
        <p class="text-lg font-semibold">
          {{
            err === 'not_found' ? 'Réservation introuvable' : 'Impossible de charger la réservation'
          }}
        </p>
        <p class="text-muted-foreground text-sm">
          Vérifiez le lien reçu dans votre message de confirmation.
        </p>
      </div>
    } @else if (reservation()?.status === 'cancelled') {
      <div class="flex flex-col items-center gap-3 py-16 text-center" data-testid="cancelled-state">
        <p class="text-lg font-semibold">Réservation annulée</p>
        <p class="text-muted-foreground text-sm">
          Cette réservation a été annulée et ne peut plus être modifiée.
        </p>
        @if (reservation()?.restaurantId; as restaurantId) {
          <a
            class="text-primary text-sm underline"
            data-testid="link-book-again"
            [routerLink]="['/client/restaurants', restaurantId, 'schedule']"
          >
            Réserver à nouveau
          </a>
        }
      </div>
    } @else {
      <article class="mx-auto flex w-full max-w-2xl flex-col gap-10 py-6">
        <hk-client-header
          eyebrow="Votre réservation"
          [title]="reservation()?.restaurantName || 'Votre réservation'"
        >
          @if (reservation()?.restaurantId; as restaurantId) {
            <a
              class="text-primary text-sm underline"
              data-testid="link-menu"
              [routerLink]="['/client/restaurants', restaurantId, 'menu']"
              [queryParams]="{ reservation: id() }"
            >
              Vous voulez voir le menu ?
            </a>
          }
        </hk-client-header>

        <div class="flex flex-col gap-4">
          <p class="font-bold">
            <span class="text-primary">1. </span>Récapitulatif de votre réservation
          </p>

          <div class="flex flex-col gap-2">
            <p>
              <span class="font-medium">Au nom de :</span>
              {{ reservation()?.customerFirstName || 'Client' }}
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

          @if (slotsError()) {
            <p class="text-destructive text-sm" role="alert">
              Impossible de charger les créneaux.
              <button type="button" class="underline" (click)="reloadSlots()">Réessayer</button>
            </p>
          } @else {
            <hk-reservation-slot-picker
              [days]="days() ?? []"
              [initialSelectedStartsAt]="reservation()?.dateTime ?? null"
              (slotPicked)="onSlotPicked($event)"
            />
          }
        </div>
      </article>

      <hlm-sheet side="bottom" [state]="sheetState()" (stateChanged)="sheetState.set($event)">
        <hlm-sheet-content
          *hlmSheetPortal="let ctx"
          class="sm:data-open:slide-in-from-bottom-0 sm:data-open:zoom-in-95 sm:data-closed:slide-out-to-bottom-0 sm:data-closed:zoom-out-95 !h-auto max-h-[90vh] w-full overflow-y-auto rounded-t-2xl p-6 sm:inset-auto! sm:top-1/2! sm:left-1/2! sm:w-[min(100vw-2rem,40rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
        >
          <!-- Mobile : feuille qui monte du bas. Grand ecran : boite centree, pas un panneau qui surgit d'en bas. -->
          <div class="mx-auto w-full max-w-xl">
            <div class="flex flex-col gap-8">
              <h1 hlmSheetTitle class="text-xl font-bold">
                {{ reservation()?.restaurantName || 'Votre réservation' }}
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

                <p class="text-sm">
                  <span class="font-medium">Au nom de :</span>
                  {{ reservation()?.customerFirstName || 'Client' }}
                </p>

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
          </div>
        </hlm-sheet-content>
      </hlm-sheet>
    }
  `,
})
export class ReservationPage {
  private service = inject(ReservationService);
  private router = inject(Router);
  private title = inject(Title);
  private destroyRef = inject(DestroyRef);

  readonly MIN_PARTY_SIZE = MIN_PARTY_SIZE;
  readonly MAX_PARTY_SIZE = MAX_PARTY_SIZE;

  id = input<string>();

  reservation = signal<PublicReservation | null>(null);
  // Lien inconnu ou reservation qui ne se deplace plus : on le dit, sans page vide.
  loadError = signal<'not_found' | 'failed' | null>(null);
  days = signal<RescheduleDay[] | null>(null);
  slotsError = signal(false);
  partySize = signal<number>(1);

  // État de la sheet de confirmation. Bindé à hlm-sheet via [state] / (stateChanged).
  sheetState = signal<BrnDialogState>('closed');
  // Slot que le user vient de cliquer : affiché dans la sheet.
  pickedSlot = signal<RescheduleSlot | null>(null);
  // Notes editables dans la sheet (le nom ne l'est pas : la route est anonyme).
  newNotes = signal<string>('');
  // Anti double-clic pendant l'appel HTTP de confirmation.
  submitting = signal<boolean>(false);
  // Message d'erreur affiché au user si la confirmation échoue (créneau pris entre-temps par ex.).
  submitError = signal<string | null>(null);

  // Signal, pas un simple champ : l'effet des creneaux doit se relancer quand la reservation
  // arrive, meme si le nombre de personnes ne change pas.
  private readonly partySizeInitialized = signal(false);

  constructor() {
    effect(() => {
      const r = this.reservation();
      if (r && !this.partySizeInitialized()) {
        this.partySize.set(r.partySize);
        this.partySizeInitialized.set(true);
      }
    });

    effect(() => {
      const id = this.id();
      const size = this.partySize();
      if (!id || !this.partySizeInitialized()) {
        return;
      }
      this.loadSlots(id, size);
    });
    effect(() => {
      const id = this.id();
      if (id) this.load(id);
    });
  }

  // Chaque chargement a un numero : une reponse en retard ne remplace jamais la plus recente.
  private slotsRun = 0;

  private loadSlots(id: string, size: number): void {
    const run = ++this.slotsRun;
    this.slotsError.set(false);
    this.service
      .getPublicRescheduleSlots(id, size)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (run === this.slotsRun) this.days.set(r.days);
        },
        // Une panne n'est pas « complet » : le client doit pouvoir reessayer.
        error: () => {
          if (run === this.slotsRun) this.slotsError.set(true);
        },
      });
  }

  reloadSlots(): void {
    const id = this.id();
    if (id) this.loadSlots(id, this.partySize());
  }

  private load(id: string): void {
    this.loadError.set(null);
    this.service
      .getPublicReservation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.reservation.set(r);
          this.title.setTitle(`Modifier ma réservation · ${r.restaurantName}`);
        },
        error: (err: unknown) => {
          const notFound = err instanceof HttpErrorResponse && err.status === 404;
          this.loadError.set(notFound ? 'not_found' : 'failed');
        },
      });
  }

  onSlotPicked(slot: RescheduleSlot): void {
    this.pickedSlot.set(slot);
    this.submitError.set(null);
    this.sheetState.set('open');
  }

  confirm(): void {
    const slot = this.pickedSlot();
    const id = this.id();
    if (!slot || !id || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    this.service
      .reschedulePublic(id, {
        startsAt: slot.startsAt,
        partySize: this.partySize(),
        notes: this.newNotes().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.sheetState.set('closed');
          this.router.navigate(['/client/reservations', id, 'confirmed']);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          if (status === 409) {
            this.submitError.set("Ce créneau vient d'être pris. Merci d'en choisir un autre.");
            this.loadSlots(id, this.partySize());
          } else {
            this.submitError.set(
              'Une erreur est survenue. Merci de réessayer dans quelques instants.',
            );
          }
        },
      });
  }
}
