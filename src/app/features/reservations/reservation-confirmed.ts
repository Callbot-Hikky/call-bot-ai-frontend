import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { ReservationService } from '@core/services/reservation.service';
import { Reservation } from '@core/models/reservation.model';

@Component({
  selector: 'app-reservation-confirmed',
  imports: [DatePipe, HlmIcon, NgIcon, RouterLink],
  template: `
    <div class="flex flex-col items-center gap-8 py-10 text-center">
      <div class="bg-primary/10 text-primary flex size-20 items-center justify-center rounded-full">
        <ng-icon hlm size="xl" name="lucideCircleCheck" />
      </div>

      <div class="flex flex-col gap-2">
        <h1 class="text-2xl font-bold">Réservation confirmée !</h1>
        <p class="text-muted-foreground">Nous vous avons envoyé un message de confirmation.</p>
      </div>

      @if (reservation(); as r) {
        <div
          class="border-border bg-card flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6 text-left"
        >
          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Restaurant
            </span>
            <span class="font-semibold">{{ r.restaurant?.name }}</span>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Date
            </span>
            <span class="font-semibold">
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
            <span class="font-semibold">{{ r.customerName }}</span>
          </div>
        </div>
        @if (r.restaurant?.id; as restaurantId) {
          <a
            class="text-primary text-sm underline"
            data-testid="link-menu"
            [routerLink]="['/client/restaurants', restaurantId, 'menu']"
            [queryParams]="{ reservation: id() }"
          >
            Vous voulez voir le menu ?
          </a>
        }
      }
    </div>
  `,
})
export class ReservationConfirmedPage implements OnInit {
  private service = inject(ReservationService);

  id = input.required<string>();
  reservation = signal<Reservation | null>(null);

  ngOnInit() {
    this.service.getReservationById(this.id()).subscribe((r) => this.reservation.set(r));
  }
}
