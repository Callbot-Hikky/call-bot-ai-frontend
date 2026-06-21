import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePhoneCall, lucideCalendarCheck, lucideUtensilsCrossed } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { ReservationService } from '@core/services/reservation.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucidePhoneCall, lucideCalendarCheck, lucideUtensilsCrossed })],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly title = signal('call-bot-ai-frontend');

  private readonly reservationService = inject(ReservationService);
  protected readonly reservations = toSignal(this.reservationService.getReservations(), {
    initialValue: [],
  });
}
