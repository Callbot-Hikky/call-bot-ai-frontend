import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheckBig,
  lucideMinus,
  lucidePlus,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { ReservationPaymentService } from '@core/services/reservation-payment.service';
import { formatCents } from '@core/models/guarantee.model';
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
  providers: [
    provideIcons({ lucideCircleCheckBig, lucideMinus, lucidePlus, lucideTriangleAlert }),
  ],
  templateUrl: './reservation-modify-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationModifyPage implements OnInit {
  readonly token = input.required<string>();

  private readonly payments = inject(ReservationPaymentService);

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

  /** Couverts retirés par rapport à la réservation telle qu'elle est enregistrée. */
  private readonly coversGivenUp = computed(() => {
    const current = this.reservation();
    return current ? Math.max(0, current.partySize - this.partySize()) : 0;
  });

  private readonly coversAdded = computed(() => {
    const current = this.reservation();
    return current ? Math.max(0, this.partySize() - current.partySize) : 0;
  });

  /**
   * Ce qui sera rendu si le convive valide, annoncé d'avance.
   *
   * <p>Le backend refait le calcul et c'est son chiffre qui fait foi ; celui-ci n'est là
   * que pour que personne ne découvre le montant après coup. Rien n'est annoncé tant que
   * les frais n'ont pas été réglés : une réservation en attente est retarifée, pas
   * remboursée.
   */
  protected readonly refundPreview = computed(() => {
    const current = this.reservation();
    if (!current || current.guaranteeStatus !== 'secured' || !current.centsPerGuest) {
      return null;
    }
    const cents = this.coversGivenUp() * current.centsPerGuest;

    return cents > 0 ? formatCents(cents, current.currency) : null;
  });

  /** Ce qui sera demandé si le convive valide une hausse sur une réservation payante. */
  protected readonly topUpPreview = computed(() => {
    const current = this.reservation();
    if (!current || !current.centsPerGuest) {
      return null;
    }
    const owes = current.guaranteeStatus === 'secured' || current.guaranteeStatus === 'awaiting';
    if (!owes) {
      return null;
    }
    const cents = this.coversAdded() * current.centsPerGuest;

    return cents > 0 ? formatCents(cents, current.currency) : null;
  });

  protected readonly changed = computed(() => {
    const current = this.reservation();
    if (!current) {
      return false;
    }

    return this.partySize() !== current.partySize || this.chosenSlot() !== null;
  });

  ngOnInit(): void {
    this.payments.getByModificationToken(this.token()).subscribe({
      next: (reservation) => {
        this.reservation.set(reservation);
        this.partySize.set(reservation.partySize);
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
    this.chosenSlot.set(null);
    this.payments.getModificationSlots(this.token(), this.partySize()).subscribe({
      next: (slots) => {
        this.days.set(slots.days.filter((day) => day.slots.length > 0));
        this.slotsLoading.set(false);
      },
      error: () => {
        this.days.set([]);
        this.slotsLoading.set(false);
      },
    });
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
    if (slot) {
      change.startsAt = slot;
    }

    this.payments.modify(this.token(), change).subscribe({
      next: (outcome) => {
        this.saving.set(false);
        this.result.set(outcome);
      },
      error: (error: { status?: number; error?: { message?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(
          error?.error?.message ??
            "La modification n'a pas abouti. Appelez le restaurant pour la faire enregistrer.",
        );
      },
    });
  }

  protected formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  protected formatDay(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${iso}T12:00:00`));
  }

  protected formatTime(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  protected formatAmount(cents: number): string {
    return formatCents(cents, this.reservation()?.currency ?? 'eur');
  }
}
