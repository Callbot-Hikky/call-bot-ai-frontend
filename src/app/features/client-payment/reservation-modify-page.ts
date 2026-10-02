import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import type { OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheckBig,
  lucideMinus,
  lucidePlus,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { Subject, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { ReservationPaymentService } from '@core/services/reservation-payment.service';
import { formatCents } from '@core/models/guarantee.model';
import { formatDateTime, formatDay, formatTime } from './format';
import type {
  GuestModification,
  PublicModification,
  RescheduleDay,
} from '@core/models/guarantee.model';

/**
 * Page de modification par le convive, ouverte depuis son lien.
 *
 * <p>Son jeton est le seul du parcours à <strong>survivre à son usage</strong> : une
 * tablée revue deux fois emprunte le même lien, et le consommer au premier passage
 * obligerait à en renvoyer un à chaque modification.
 *
 * <p>Les couverts et l'horaire se tiennent : une table pour huit n'est pas une table
 * pour deux, donc la grille de créneaux se redemande au serveur à chaque changement de
 * tablée. Aucun couple (couverts, horaire) sans table n'est jamais proposé.
 *
 * <p>Le sort de l'argent est annoncé <em>avant</em> le clic, comme sur la page
 * d'annulation : une baisse qui rembourse en silence se lit aussi mal qu'une baisse qui
 * ne rembourse rien.
 */
@Component({
  selector: 'app-reservation-modify-page',
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucideCircleCheckBig, lucideMinus, lucidePlus, lucideTriangleAlert })],
  templateUrl: './reservation-modify-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationModifyPage implements OnInit {
  readonly token = input.required<string>();

  private readonly payments = inject(ReservationPaymentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reservation = signal<PublicModification | null>(null);
  protected readonly loading = signal(true);
  protected readonly linkDead = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly result = signal<GuestModification | null>(null);

  /** Ce que le convive envisage, pas encore ce qu'il a validé. */
  protected readonly partySize = signal(1);
  protected readonly chosenSlot = signal<string | null>(null);
  protected readonly days = signal<RescheduleDay[]>([]);
  protected readonly slotsLoading = signal(false);
  /** Distinct de « aucun créneau » : une panne réseau n'est pas une salle complète. */
  protected readonly slotsFailed = signal(false);

  /**
   * Les demandes de créneaux, réduites à la dernière.
   *
   * <p>Sans cela, deux clics rapides sur « + » lancent deux requêtes dont les réponses
   * peuvent revenir dans le désordre, et la grille finit par montrer les créneaux d'une
   * tablée que le convive a déjà quittée.
   */
  private readonly slotRequests = new Subject<number>();

  /** Couverts retirés par rapport à la réservation telle qu'elle est enregistrée. */
  private readonly coversGivenUp = computed(() => {
    const current = this.reservation();
    return current?.partySize ? Math.max(0, current.partySize - this.partySize()) : 0;
  });

  private readonly coversAdded = computed(() => {
    const current = this.reservation();
    return current?.partySize ? Math.max(0, this.partySize() - current.partySize) : 0;
  });

  /**
   * Ce qui sera rendu si le convive valide, annoncé d'avance.
   *
   * <p>Le backend refait le calcul et c'est son chiffre qui fait foi ; celui-ci n'est là
   * que pour que personne ne découvre le montant après coup. Réservé au mode
   * `booking_fee` : sous garantie `no_show`, le montant par couvert est une
   * <em>pénalité</em> jamais débitée, et l'annoncer comme un remboursement promettrait
   * le retour d'une somme qui n'est jamais entrée.
   *
   * <p>Rien n'est annoncé tant que les frais n'ont pas été réglés : une réservation en
   * attente est retarifée, pas remboursée.
   */
  protected readonly refundPreview = computed(() => {
    const current = this.reservation();
    if (!this.ridesOnABookingFee(current) || current?.guaranteeStatus !== 'secured') {
      return null;
    }
    const cents = this.coversGivenUp() * (current.centsPerGuest ?? 0);

    return cents > 0 ? formatCents(cents, current.currency) : null;
  });

  /** Ce qui sera demandé si le convive valide une hausse sur une réservation payante. */
  protected readonly topUpPreview = computed(() => {
    const current = this.reservation();
    if (!this.ridesOnABookingFee(current)) {
      return null;
    }
    const owes = current?.guaranteeStatus === 'secured' || current?.guaranteeStatus === 'awaiting';
    if (!owes) {
      return null;
    }
    const cents = this.coversAdded() * (current.centsPerGuest ?? 0);

    return cents > 0 ? formatCents(cents, current.currency) : null;
  });

  /** Un changement réel : re-choisir l'horaire déjà en place n'en est pas un. */
  protected readonly changed = computed(() => {
    const current = this.reservation();
    if (!current) {
      return false;
    }
    const slot = this.chosenSlot();

    return this.partySize() !== current.partySize || (slot !== null && slot !== current.startsAt);
  });

  /** Jusqu'à quand le restaurateur laisse le convive changer quelque chose. */
  protected readonly closesAt = computed(() => {
    const iso = this.reservation()?.closesAt;
    return iso ? formatDateTime(iso) : null;
  });

  constructor() {
    this.slotRequests
      .pipe(
        switchMap((partySize) =>
          this.payments.getModificationSlots(this.token(), partySize).pipe(
            map((slots) => slots.days.filter((day) => day.slots.length > 0)),
            catchError(() => of(null)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((days) => {
        this.slotsFailed.set(days === null);
        this.days.set(days ?? []);
        this.slotsLoading.set(false);
      });
  }

  ngOnInit(): void {
    this.payments
      .getByModificationToken(this.token())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reservation) => {
          this.reservation.set(reservation);
          this.partySize.set(reservation.partySize ?? 1);
          this.loading.set(false);
          if (reservation.open) {
            this.loadSlots();
          }
        },
        error: () => {
          this.linkDead.set(true);
          this.loading.set(false);
        },
      });
  }

  /**
   * Redemande la grille pour la tablée envisagée.
   *
   * <p>Le créneau déjà choisi est oublié au passage : il avait été proposé pour une autre
   * tablée et rien ne dit qu'une table le tient encore.
   */
  private loadSlots(): void {
    this.slotsLoading.set(true);
    this.slotsFailed.set(false);
    this.chosenSlot.set(null);
    this.slotRequests.next(this.partySize());
  }

  /** Seul le droit de réservation se rend ou se complète ; la pénalité, jamais. */
  private ridesOnABookingFee(reservation: PublicModification | null): boolean {
    return reservation?.guaranteeMode === 'booking_fee' && !!reservation.centsPerGuest;
  }

  protected changePartySize(delta: number): void {
    const next = this.partySize() + delta;
    if (next < 1 || this.saving()) {
      return;
    }
    this.partySize.set(next);
    this.loadSlots();
  }

  protected chooseSlot(startsAt: string): void {
    this.chosenSlot.set(this.chosenSlot() === startsAt ? null : startsAt);
  }

  protected submit(): void {
    const current = this.reservation();
    if (!current || this.saving() || !this.changed()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);

    // Seul ce qui bouge est envoyé : ce qui est omis est laissé tel quel côté serveur.
    const change: { partySize?: number; startsAt?: string } = {};
    if (this.partySize() !== current.partySize) {
      change.partySize = this.partySize();
    }
    const slot = this.chosenSlot();
    if (slot && slot !== current.startsAt) {
      change.startsAt = slot;
    }

    this.payments
      .modify(this.token(), change)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outcome) => {
          this.saving.set(false);
          // Une hausse qui doit de l'argent n'est pas faite tant qu'elle n'est pas payée :
          // le convive part la régler plutôt que de lire une confirmation trompeuse.
          if (outcome.topUpPaymentToken) {
            void this.router.navigate([
              '/client/reservations/complement',
              outcome.topUpPaymentToken,
            ]);

            return;
          }
          this.result.set(outcome);
        },
        error: (error: { error?: { message?: string } }) => {
          this.saving.set(false);
          // Le backend rend des refus rédigés pour le convive (« Aucune table n'est libre
          // sur ce créneau… ») : les montrer vaut mieux qu'un message générique.
          this.errorMessage.set(
            error?.error?.message ??
              "La modification n'a pas abouti. Appelez le restaurant pour la faire enregistrer.",
          );
        },
      });
  }

  protected readonly formatDateTime = formatDateTime;
  protected readonly formatDay = formatDay;
  protected readonly formatTime = formatTime;

  protected formatAmount(cents: number): string {
    return formatCents(cents, this.reservation()?.currency);
  }
}
