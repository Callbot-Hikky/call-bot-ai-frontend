import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ReservationService } from '@core/services/reservation.service';
import { PublicReservation } from '@core/models/reservation.model';

@Component({
  selector: 'app-reservation-confirmed',
  imports: [DatePipe, HlmIcon, NgIcon, RouterLink],
  template: `
    <div class="flex flex-col items-center gap-8 py-10 text-center">
      @if (error()) {
        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-bold">Réservation introuvable</h1>
          <p class="text-muted-foreground">Ce lien ne correspond à aucune réservation.</p>
        </div>
      } @else if (cancelled()) {
        <div
          class="bg-st-cancelled-bg text-st-cancelled-fg flex size-20 items-center justify-center rounded-full"
        >
          <ng-icon hlm size="xl" name="lucideCircleX" />
        </div>
        <div class="flex flex-col gap-2" data-testid="cancelled-state">
          <h1 class="text-2xl font-bold">Réservation annulée</h1>
          <p class="text-muted-foreground">
            Cette réservation a été annulée. Vous pouvez en faire une nouvelle à tout moment.
          </p>
        </div>
      } @else {
        <div
          class="bg-primary/10 text-primary flex size-20 items-center justify-center rounded-full"
        >
          <ng-icon hlm size="xl" name="lucideCircleCheck" />
        </div>

        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-bold">Réservation confirmée !</h1>
          <p class="text-muted-foreground">Nous vous avons envoyé un message de confirmation.</p>
        </div>
      }

      @if (reservation(); as r) {
        <div
          class="border-border bg-card flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6 text-left"
        >
          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Restaurant
            </span>
            <span class="font-semibold">{{ r.restaurantName }}</span>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Date
            </span>
            <span class="font-semibold first-letter:uppercase">
              {{ r.dateTime | date: 'EEEE d MMMM à HH:mm' }}
            </span>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Nombre de personnes
            </span>
            <span class="font-semibold">
              {{ r.partySize }} personne{{ r.partySize > 1 ? 's' : '' }}
            </span>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Au nom de
            </span>
            <span class="font-semibold">{{ r.customerFirstName || 'Client' }}</span>
          </div>
        </div>
        <div class="flex flex-col items-center gap-2">
          @if (r.restaurantId; as restaurantId) {
            <a
              class="text-primary text-sm underline"
              data-testid="link-menu"
              [routerLink]="['/client/restaurants', restaurantId, 'menu']"
              [queryParams]="{ reservation: id() }"
            >
              Vous voulez voir le menu ?
            </a>
          }
          @if (cancelled()) {
            @if (r.restaurantId; as restaurantId) {
              <a
                class="text-primary text-sm underline"
                data-testid="link-book-again"
                [routerLink]="['/client/restaurants', restaurantId, 'schedule']"
              >
                Réserver à nouveau
              </a>
            }
          } @else {
            <a
              class="text-muted-foreground text-sm underline"
              data-testid="link-reschedule"
              [routerLink]="['/client/reservations', id(), 'reschedule']"
            >
              Changer l'heure ou le jour
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class ReservationConfirmedPage implements OnInit {
  private service = inject(ReservationService);
  private title = inject(Title);
  private destroyRef = inject(DestroyRef);

  id = input.required<string>();
  reservation = signal<PublicReservation | null>(null);
  error = signal(false);
  // Le lien de confirmation survit a l'annulation : la page doit dire la verite.
  cancelled = computed(() => this.reservation()?.status === 'cancelled');

  // Lecture publique : la page sert au client qui vient de reserver ou de replanifier, sans session.
  ngOnInit() {
    this.service
      .getPublicReservation(this.id())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.reservation.set(r);
          this.title.setTitle(
            `${r.status === 'cancelled' ? 'Réservation annulée' : 'Réservation confirmée'} · ${r.restaurantName}`,
          );
        },
        error: () => this.error.set(true),
      });
  }
}
