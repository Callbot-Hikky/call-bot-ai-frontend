import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkStatRow, StatItem } from '@shared/components/organisms/stat-row/hk-stat-row';
import {
  HkReservationList,
  ReservationSort,
} from '@shared/components/organisms/reservation-list/hk-reservation-list';
import { HkReservationDetailDrawer } from '@shared/components/organisms/reservation-detail-drawer/hk-reservation-detail-drawer';
import { HkFilterBar, StatusFilter } from '@shared/components/molecules/filter-bar/hk-filter-bar';
import { HkCallbackRequests } from '@shared/components/organisms/callback-requests/hk-callback-requests';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import {
  HkViewToggle,
  ReservationView,
} from '@shared/components/molecules/view-toggle/hk-view-toggle';
import { AssignEvent, HkFloorPlan } from '@shared/components/organisms/floor-plan/hk-floor-plan';
import { ReservationService } from '@core/services/reservation.service';
import { TableService } from '@core/services/table.service';
import { CallbackService } from '@core/services/callback.service';
import { ToastService } from '@core/services/toast.service';
import { Reservation, ReservationStatus } from '@core/models/reservation.model';
import { CallbackRequest } from '@core/models/callback-request.model';

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
    HkCallbackRequests,
    HkFilterBar,
    HkReservationList,
    HkReservationDetailDrawer,
    HkButton,
    HkViewToggle,
    HkFloorPlan,
  ],
  template: `
    <hk-page-header [subtitle]="today">
      <hk-button variant="secondary" size="sm">Aujourd'hui</hk-button>
      <hk-button size="sm">Nouvelle réservation</hk-button>
    </hk-page-header>

    <div class="flex flex-col gap-6">
      <hk-stat-row [stats]="stats()" [loading]="service.loading()" />
      <hk-callback-requests
        [requests]="callbacks.callbacks()"
        [loading]="callbacks.loading()"
        [error]="callbacks.error()"
        (callBack)="onCallBack($event)"
        (handled)="onHandled($event)"
        (retry)="callbacks.loadPending()"
      />

      <div class="flex items-center justify-between">
        <hk-view-toggle [view]="view()" (viewChange)="onViewChange($event)" />
      </div>

      @if (view() === 'list') {
        <hk-filter-bar [(status)]="statusFilter" [(search)]="search" />
        <hk-reservation-list
          [reservations]="displayed()"
          [loading]="service.loading()"
          [error]="service.error()"
          [sort]="sort()"
          (sortChange)="sort.set($event)"
          (open)="openDetail($event, false)"
          (confirm)="onConfirm($event)"
          (cancelReservation)="onCancel($event)"
          (call)="onCall($event)"
          (retry)="service.loadToday()"
        />
      } @else {
        <hk-floor-plan
          [reservations]="service.reservations()"
          [tables]="tables.tables()"
          [loading]="service.loading() || tables.loading()"
          [error]="service.error() || tables.error()"
          (openReservation)="openDetail($event, true)"
          (assign)="onAssign($event)"
          (unassign)="onUnassign($event)"
          (retry)="reload()"
        />
      }
    </div>

    <hk-reservation-detail-drawer
      [reservation]="selected()"
      [(state)]="drawerState"
      [showUnassign]="drawerFromPlan()"
      (confirm)="onConfirm($event)"
      (cancelReservation)="onCancel($event)"
      (call)="onCall($event)"
      (unassign)="onUnassign($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsPage {
  protected readonly service = inject(ReservationService);
  protected readonly tables = inject(TableService);
  protected readonly callbacks = inject(CallbackService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly view = signal<ReservationView>('list');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly search = signal('');
  protected readonly sort = signal<ReservationSort | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly drawerState = signal<BrnDialogState>('closed');
  // Vrai si le drawer a ete ouvert depuis le plan (active l'action "Liberer la table").
  protected readonly drawerFromPlan = signal(false);
  // Charge les tables une seule fois, au premier passage en vue Plan.
  private tablesLoaded = false;

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
      { label: 'Captées par le bot', value: bot, icon: 'lucidePhoneCall', highlight: true },
      { label: 'Confirmation', value: `${rate}%`, icon: 'lucideCircleCheck' },
    ];
  });

  constructor() {
    this.service.loadToday();
    this.callbacks.loadPending();
  }

  // Bascule de vue + chargement paresseux des tables au 1er passage en vue Plan
  // (declenchement explicite plutot qu'un effect a effet de bord).
  protected onViewChange(view: ReservationView): void {
    this.view.set(view);
    if (view === 'plan' && !this.tablesLoaded) {
      this.tablesLoaded = true;
      this.tables.loadTables();
    }
  }

  protected openDetail(reservation: Reservation, fromPlan = false): void {
    this.selectedId.set(reservation.id);
    this.drawerFromPlan.set(fromPlan);
    this.drawerState.set('open');
  }

  // Recharge tables + reservations (bouton Reessayer du plan).
  protected reload(): void {
    this.service.loadToday();
    this.tables.loadTables();
  }

  protected onAssign(event: AssignEvent): void {
    this.service
      .assign(event.reservationId, event.table)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.show(`Réservation placée en ${event.table.name}`, 'success'),
        error: () => this.toast.show("Échec de l'affectation", 'error'),
      });
  }

  protected onUnassign(reservation: Reservation): void {
    this.service
      .unassign(reservation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.show('Table libérée');
          this.drawerState.set('closed');
        },
        error: () => this.toast.show('Échec de la libération', 'error'),
      });
  }

  protected onConfirm(reservation: Reservation): void {
    this.service
      .confirm(reservation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.toast.show('Réservation confirmée', 'success'));
  }

  protected onCancel(reservation: Reservation): void {
    this.service
      .cancel(reservation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.toast.show('Réservation annulée'));
  }

  protected onCall(reservation: Reservation): void {
    this.toast.show(`Appel de ${reservation.customerName}...`);
  }

  protected onCallBack(request: CallbackRequest): void {
    this.toast.show(`Rappel de ${request.customerName}...`);
  }

  protected onHandled(request: CallbackRequest): void {
    this.callbacks.markHandled(request.id).subscribe(() =>
      this.toast.show('Demande de rappel traitée', 'success', {
        label: 'Annuler',
        run: () => this.callbacks.restore(request),
      }),
    );
  }
}
