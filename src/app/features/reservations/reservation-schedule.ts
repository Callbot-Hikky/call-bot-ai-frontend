import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { MenuService } from '@core/services/menu.service';
import { ReservationService } from '@core/services/reservation.service';
import {
  BOOKING_MAX_PARTY_SIZE,
  RescheduleDay,
  RescheduleSlot,
} from '@core/models/reservation.model';
import { HkReservationSlotPicker } from '@shared/components/organisms/reservation-slot-picker/hk-reservation-slot-picker';
import { HkCounter } from '@shared/components/molecules/counter/hk-counter';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkClientHeader } from '@shared/components/molecules/client-header/hk-client-header';

const MIN_PARTY_SIZE = 1;
// Meme regle que le back (PublicReservationRequest.Customer.phone) : refuse avant d'envoyer.
const PHONE_PATTERN = /^\+?[0-9 .()-]{6,20}$/;

// Reservation en ligne, sans compte : le client arrive par le lien ou le QR « Reserver une
// table » du restaurateur. Meme squelette que la replanification (reservation.ts), mais ici
// on cree : le client est encore inconnu, on lui demande prenom et telephone.
@Component({
  selector: 'app-reservation-schedule',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    HkReservationSlotPicker,
    HkCounter,
    HkSkeleton,
    HkClientHeader,
    ...HlmSheetImports,
    BrnSheetContent,
    HlmButton,
  ],
  template: `
    @if (loading()) {
      <div
        class="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6"
        aria-busy="true"
        aria-label="Chargement"
      >
        <hk-skeleton height="2rem" width="14rem" />
        <hk-skeleton height="1rem" width="10rem" />
        <hk-skeleton height="12rem" />
      </div>
    } @else if (loadError(); as err) {
      <div class="flex flex-col items-center gap-3 py-16 text-center">
        @if (err === 'not_found') {
          <p class="text-text-strong text-lg font-semibold">Ce restaurant est introuvable.</p>
          <p class="text-text-muted text-sm">
            Vérifiez le lien ou le QR code que l'on vous a donné.
          </p>
        } @else {
          <p class="text-text-strong text-lg font-semibold">Impossible de charger la page.</p>
          <button type="button" class="text-primary text-sm underline" (click)="loadRestaurant()">
            Réessayer
          </button>
        }
      </div>
    } @else {
      <article class="mx-auto flex w-full max-w-2xl flex-col gap-10 py-6">
        <hk-client-header eyebrow="Réserver une table" [title]="restaurantName()">
          <p class="text-text-muted text-sm">En quelques secondes, sans compte.</p>
          @if (hasMenu()) {
            <a
              class="text-primary text-sm underline"
              data-testid="link-menu"
              [routerLink]="['/client/restaurants', id(), 'menu']"
            >
              Vous voulez voir le menu ?
            </a>
          }
        </hk-client-header>

        <div class="flex flex-col gap-4">
          <p class="font-bold"><span class="text-primary">1. </span>Combien de personnes ?</p>
          <hk-counter [(value)]="partySize" [min]="MIN_PARTY_SIZE" [max]="MAX_PARTY_SIZE" />
          @if (partySize() >= MAX_PARTY_SIZE) {
            <p class="text-text-muted text-sm" data-testid="party-max-hint">
              Au-delà de {{ MAX_PARTY_SIZE }} personnes, appelez directement le restaurant.
            </p>
          }
        </div>

        <div class="flex flex-col gap-4">
          <p class="font-bold"><span class="text-primary">2. </span>Choisissez un créneau</p>
          @if (pageError(); as err) {
            <p
              class="bg-st-pending-bg text-st-pending-fg rounded-md px-3 py-2 text-sm"
              role="alert"
              data-testid="booking-error"
            >
              {{ err }}
            </p>
          }
          @if (days() === null && slotsLoading()) {
            <div class="flex flex-col gap-3" aria-busy="true" aria-label="Chargement des créneaux">
              <hk-skeleton height="3rem" />
              <hk-skeleton height="3rem" />
              <hk-skeleton height="3rem" />
            </div>
          } @else if (slotsError()) {
            <p class="text-destructive text-sm" role="alert">
              Impossible de charger les créneaux.
              <button type="button" class="underline" (click)="loadSlots()">Réessayer</button>
            </p>
          } @else if (noSlotAtAll()) {
            <p class="text-text-muted text-sm" data-testid="no-slots">
              Aucun créneau disponible ces 7 prochains jours pour
              {{ partySize() }} personne{{ partySize() > 1 ? 's' : '' }}. Essayez un autre nombre de
              personnes, ou appelez le restaurant.
            </p>
          } @else {
            <!-- Le selecteur reste monte pendant un rechargement : les jours ouverts ne se referment pas. -->
            <div
              [class.opacity-60]="slotsLoading()"
              [class.pointer-events-none]="slotsLoading()"
              [attr.aria-busy]="slotsLoading()"
            >
              <hk-reservation-slot-picker
                [days]="days() ?? []"
                [initialSelectedStartsAt]="pickedSlot()?.startsAt ?? null"
                [expandFirstAvailable]="true"
                (slotPicked)="onSlotPicked($event)"
              />
            </div>
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
            <form class="flex flex-col gap-8" (ngSubmit)="confirm()" novalidate>
              <h1 hlmSheetTitle class="text-xl font-bold">{{ restaurantName() }}</h1>

              <div class="flex flex-col gap-2">
                <p class="font-bold"><span class="text-primary">1. </span>Nombre de personnes</p>
                <p>{{ partySize() }} personne{{ partySize() > 1 ? 's' : '' }}</p>
              </div>

              <div class="flex flex-col gap-2">
                <p class="font-bold"><span class="text-primary">2. </span>Créneau</p>
                <p class="first-letter:uppercase">
                  {{ pickedSlot()?.startsAt | date: 'EEEE d MMMM à HH:mm' }}
                </p>
              </div>

              <div class="flex flex-col gap-4">
                <p class="font-bold"><span class="text-primary">3. </span>Vos informations</p>

                <label class="flex flex-col gap-2">
                  <span class="text-sm font-medium">Prénom</span>
                  <input
                    type="text"
                    name="firstName"
                    autocomplete="given-name"
                    data-testid="booking-first-name"
                    class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    [class.border-destructive]="fieldErrors().firstName"
                    [(ngModel)]="firstName"
                    (ngModelChange)="clearFieldError('firstName')"
                  />
                  @if (fieldErrors().firstName; as msg) {
                    <span class="text-destructive text-xs" role="alert">{{ msg }}</span>
                  }
                </label>

                <label class="flex flex-col gap-2">
                  <span class="text-sm font-medium">Téléphone</span>
                  <input
                    type="tel"
                    name="phone"
                    autocomplete="tel"
                    inputmode="tel"
                    placeholder="06 12 34 56 78"
                    data-testid="booking-phone"
                    class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    [class.border-destructive]="fieldErrors().phone"
                    [(ngModel)]="phone"
                    (ngModelChange)="clearFieldError('phone')"
                  />
                  @if (fieldErrors().phone; as msg) {
                    <span class="text-destructive text-xs" role="alert">{{ msg }}</span>
                  } @else {
                    <span class="text-text-muted text-xs">
                      Pour vous prévenir en cas d'imprévu. Jamais partagé.
                    </span>
                  }
                </label>

                <label class="flex flex-col gap-2">
                  <span class="text-sm font-medium">Notes (facultatif)</span>
                  <textarea
                    name="notes"
                    rows="3"
                    maxlength="500"
                    placeholder="Allergies, poussette, occasion spéciale…"
                    data-testid="booking-notes"
                    class="border-border bg-background focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    [(ngModel)]="notes"
                  ></textarea>
                </label>
              </div>

              @if (submitError(); as err) {
                <p class="text-destructive text-sm" role="alert" data-testid="booking-submit-error">
                  {{ err }}
                </p>
              }

              <button
                hlmBtn
                type="submit"
                size="lg"
                class="w-full py-6 text-base font-semibold"
                data-testid="booking-submit"
                [disabled]="submitting()"
              >
                {{ submitting() ? 'Réservation en cours…' : 'Confirmer la réservation' }}
              </button>
            </form>
          </div>
        </hlm-sheet-content>
      </hlm-sheet>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationSchedulePage {
  private readonly menuService = inject(MenuService);
  private readonly reservations = inject(ReservationService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly MIN_PARTY_SIZE = MIN_PARTY_SIZE;
  readonly MAX_PARTY_SIZE = BOOKING_MAX_PARTY_SIZE;

  // Parametre de route, lie par withComponentInputBinding.
  readonly id = input<string>();

  protected readonly restaurantName = signal('');
  protected readonly hasMenu = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<'not_found' | 'failed' | null>(null);

  protected readonly partySize = signal(2);
  // null tant que rien n'est charge : distingue « pas encore la » de « aucun jour renvoye ».
  protected readonly days = signal<RescheduleDay[] | null>(null);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsError = signal(false);
  protected readonly pageError = signal<string | null>(null);
  protected readonly noSlotAtAll = computed(() => {
    const days = this.days();
    return days !== null && days.every((d) => d.slots.length === 0);
  });
  // Chaque chargement a un numero : une reponse en retard ne remplace jamais la plus recente.
  private slotsRun = 0;

  protected readonly sheetState = signal<BrnDialogState>('closed');
  protected readonly pickedSlot = signal<RescheduleSlot | null>(null);
  protected readonly firstName = signal('');
  protected readonly phone = signal('');
  protected readonly notes = signal('');
  protected readonly fieldErrors = signal<{ firstName?: string; phone?: string }>({});
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) this.loadRestaurant(id);
    });
    // Le compteur pilote les creneaux : une table de 2 et une table de 8 ne sont pas libres aux memes heures.
    effect(() => {
      const id = this.id();
      const size = this.partySize();
      if (id && size > 0) this.loadSlots(id, size);
    });
  }

  protected loadRestaurant(id = this.id()): void {
    if (!id) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.menuService
      .getPublic(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (menu) => {
          this.restaurantName.set(menu.restaurantName);
          this.title.setTitle(`Réserver chez ${menu.restaurantName}`);
          this.hasMenu.set(menu.mode !== 'none');
          this.loading.set(false);
        },
        error: (err: unknown) => {
          const notFound = err instanceof HttpErrorResponse && err.status === 404;
          this.loadError.set(notFound ? 'not_found' : 'failed');
          this.loading.set(false);
        },
      });
  }

  protected loadSlots(id = this.id(), size = this.partySize()): void {
    if (!id) return;
    const run = ++this.slotsRun;
    this.slotsLoading.set(true);
    this.slotsError.set(false);
    this.reservations
      .getPublicSlots(id, size)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (run !== this.slotsRun) return;
          this.days.set(r.days);
          this.slotsLoading.set(false);
        },
        error: () => {
          if (run !== this.slotsRun) return;
          this.slotsError.set(true);
          this.slotsLoading.set(false);
        },
      });
  }

  protected onSlotPicked(slot: RescheduleSlot): void {
    this.pickedSlot.set(slot);
    this.pageError.set(null);
    this.submitError.set(null);
    this.fieldErrors.set({});
    this.sheetState.set('open');
  }

  protected clearFieldError(field: 'firstName' | 'phone'): void {
    if (this.fieldErrors()[field]) {
      this.fieldErrors.update((e) => ({ ...e, [field]: undefined }));
    }
  }

  // Les memes regles que le back, verifiees ici pour un retour immediat et en francais.
  private validate(): boolean {
    const errors: { firstName?: string; phone?: string } = {};
    if (this.firstName().trim() === '') errors.firstName = 'Indiquez votre prénom.';
    if (!PHONE_PATTERN.test(this.phone().trim())) {
      errors.phone = 'Indiquez un numéro de téléphone valide, par exemple 06 12 34 56 78.';
    }
    this.fieldErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  private errorCode(err: unknown): string | null {
    if (!(err instanceof HttpErrorResponse)) return null;
    const body = err.error as { error?: unknown } | null;
    return typeof body?.error === 'string' ? body.error : null;
  }

  protected confirm(): void {
    const slot = this.pickedSlot();
    const id = this.id();
    if (!slot || !id || this.submitting() || !this.validate()) return;

    this.submitting.set(true);
    this.submitError.set(null);
    this.reservations
      .createPublic(id, {
        startsAt: slot.startsAt,
        partySize: this.partySize(),
        customer: { firstName: this.firstName().trim(), phone: this.phone().trim() },
        notes: this.notes().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.submitting.set(false);
          this.sheetState.set('closed');
          void this.router.navigate(['/client/reservations', created.id, 'confirmed']);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          if (status === 409 && this.errorCode(err) === 'already_booked') {
            this.submitError.set(
              'Ce numéro a déjà une réservation ce jour-là. Pour la modifier, utilisez le lien reçu par message.',
            );
          } else if (status === 409) {
            // Pris entre l'affichage et le clic : on referme la feuille, on le dit au-dessus de la
            // liste, et on remet les creneaux a jour pour choisir a nouveau.
            this.sheetState.set('closed');
            this.pickedSlot.set(null);
            this.pageError.set("Ce créneau vient d'être pris. Merci d'en choisir un autre.");
            this.loadSlots();
          } else if (status === 400) {
            this.submitError.set(
              'Vérifiez vos informations : le créneau ou le nombre de personnes ne convient pas.',
            );
          } else {
            this.submitError.set(
              'Une erreur est survenue. Merci de réessayer dans quelques instants.',
            );
          }
        },
      });
  }
}
