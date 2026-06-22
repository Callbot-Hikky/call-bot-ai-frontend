import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkStatRow, StatItem } from '@shared/components/organisms/stat-row/hk-stat-row';
import {
  HkReservationList,
  ReservationSort,
} from '@shared/components/organisms/reservation-list/hk-reservation-list';
import { HkReservationDetailDrawer } from '@shared/components/organisms/reservation-detail-drawer/hk-reservation-detail-drawer';
import { HkFilterBar, StatusFilter } from '@shared/components/molecules/filter-bar/hk-filter-bar';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { ReservationService } from '@core/services/reservation.service';
import { ToastService } from '@core/services/toast.service';
import { Reservation, ReservationStatus } from '@core/models/reservation.model';

// Ordre métier des statuts pour le tri.
const STATUS_ORDER: Record<ReservationStatus, number> = {
  pending: 0,
  confirmed: 1,
  seated: 2,
  completed: 3,
  cancelled: 4,
  no_show: 5,
};

// Écran « Réservations du jour » (US 6.2). Assemble les organismes et branche le
// ReservationService. Filtrage et KPI dérivés en computed signals.
@Component({
  selector: 'app-reservations',
  imports: [
    HkPageHeader,
    HkStatRow,
    HkFilterBar,
    HkReservationList,
    HkReservationDetailDrawer,
    HkButton,
  ],
  template: `
    <hk-page-header [subtitle]="today">
      <hk-button variant="secondary" size="sm">Aujourd'hui</hk-button>
      <hk-button size="sm">Nouvelle réservation</hk-button>
    </hk-page-header>

    <div class="flex flex-col gap-6">
      <hk-stat-row [stats]="stats()" [loading]="service.loading()" />
      <hk-filter-bar [(status)]="statusFilter" [(search)]="search" />
      <hk-reservation-list
        [reservations]="displayed()"
        [loading]="service.loading()"
        [error]="service.error()"
        [sort]="sort()"
        (sortChange)="sort.set($event)"
        (open)="openDetail($event)"
        (confirm)="onConfirm($event)"
        (cancelReservation)="onCancel($event)"
        (call)="onCall($event)"
        (retry)="service.loadToday()"
      />
    </div>

    <hk-reservation-detail-drawer
      [reservation]="selected()"
      [(state)]="drawerState"
      (confirm)="onConfirm($event)"
      (cancelReservation)="onCancel($event)"
      (call)="onCall($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsPage {
  protected readonly service = inject(ReservationService);
  private readonly toast = inject(ToastService);

  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly search = signal('');
  protected readonly sort = signal<ReservationSort | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly drawerState = signal<BrnDialogState>('closed');

  protected readonly today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Drawer synchronisé par id : reflète toujours l'état à jour du service.
  protected readonly selected = computed(
    () => this.service.reservations().find((r) => r.id === this.selectedId()) ?? null,
  );

  protected readonly filtered = computed(() => {
    const status = this.statusFilter();
    const query = this.search().trim().toLowerCase();
    const phoneQuery = query.replace(/\s/g, '');
    return this.service.reservations().filter((r) => {
      const matchStatus = status === 'all' || r.status === status;
      const matchSearch =
        !query ||
        r.customerName.toLowerCase().includes(query) ||
        r.phone.replace(/\s/g, '').includes(phoneQuery);
      return matchStatus && matchSearch;
    });
  });

  // Liste filtrée puis triée (si un tri est actif).
  protected readonly displayed = computed(() => {
    const sort = this.sort();
    const list = this.filtered();
    if (!sort) {
      return list;
    }
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const diff =
        sort.key === 'time'
          ? a.dateTime.localeCompare(b.dateTime)
          : STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return diff * factor;
    });
  });

  protected readonly stats = computed<StatItem[]>(() => {
    const all = this.service.reservations();
    const active = all.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
    const couverts = active.reduce((sum, r) => sum + r.partySize, 0);
    const bot = all.filter((r) => r.source === 'callbot').length;
    const honored = all.filter(
      (r) => r.status === 'confirmed' || r.status === 'seated' || r.status === 'completed',
    ).length;
    const rate = active.length ? Math.round((honored / active.length) * 100) : 0;
    return [
      { label: 'Réservations', value: active.length, icon: 'lucideCalendar' },
      { label: 'Couverts', value: couverts, icon: 'lucideUsers' },
      { label: 'Captées par le bot', value: bot, icon: 'lucidePhoneCall' },
      { label: 'Confirmation', value: `${rate}%` },
    ];
  });

  constructor() {
    this.service.loadToday();
  }

  protected openDetail(reservation: Reservation): void {
    this.selectedId.set(reservation.id);
    this.drawerState.set('open');
  }

  protected onConfirm(reservation: Reservation): void {
    this.service
      .confirm(reservation.id)
      .subscribe(() => this.toast.show('Réservation confirmée', 'success'));
  }

  protected onCancel(reservation: Reservation): void {
    this.service.cancel(reservation.id).subscribe(() => this.toast.show('Réservation annulée'));
  }

  protected onCall(reservation: Reservation): void {
    this.toast.show(`Appel de ${reservation.customerName}...`);
  }
}
