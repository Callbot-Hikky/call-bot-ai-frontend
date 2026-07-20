import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
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
import {
  HkNewReservationDialog,
  NewReservationInput,
} from '@shared/components/organisms/new-reservation-dialog/hk-new-reservation-dialog';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { ReservationService } from '@core/services/reservation.service';
import { ReservationActionsService } from '@core/services/reservation-actions.service';
import { CallbackService } from '@core/services/callback.service';
import { ToastService } from '@core/services/toast.service';
import { Reservation, ReservationStatus } from '@core/models/reservation.model';
import { CallbackRequest } from '@core/models/callback-request.model';
import { formatTime } from '@core/utils/format';

// Ordre métier des statuts pour le tri.
const STATUS_ORDER: Record<ReservationStatus, number> = {
  pending: 0,
  confirmed: 1,
  seated: 2,
  completed: 3,
  cancelled: 4,
  no_show: 5,
};

// Écran « Réservations du jour » (US 6.2) : KPI, demandes de rappel et LISTE.
// Le plan de salle vit desormais sur SA page (« Plan de salle », sidebar) ;
// les deux ecrans partagent les memes services (signals) — une affectation
// faite sur le plan est visible ici immediatement.
@Component({
  selector: 'app-reservations',
  imports: [
    HkPageHeader,
    HkStatRow,
    HkCallbackRequests,
    HkFilterBar,
    HkReservationList,
    HkReservationDetailDrawer,
    HkNewReservationDialog,
    HkButton,
    HkIcon,
  ],
  template: `
    <hk-page-header [subtitle]="today">
      <hk-button size="sm" data-testid="open-new-resa" (click)="newResaState.set('open')">
        <hk-icon name="lucidePlus" [size]="16" />
        Nouvelle réservation
      </hk-button>
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

      <hk-filter-bar [(status)]="statusFilter" [(search)]="search" />
      <hk-reservation-list
        [reservations]="displayed()"
        [loading]="service.loading()"
        [error]="service.error()"
        [sort]="sort()"
        (sortChange)="sort.set($event)"
        (open)="openDetail($event)"
        (place)="onPlace($event)"
        (confirm)="onConfirm($event)"
        (cancelReservation)="onCancel($event)"
        (call)="onCall($event)"
        (retry)="service.loadToday()"
      />
    </div>

    <hk-new-reservation-dialog
      [(state)]="newResaState"
      [busy]="creatingManual()"
      (createReservation)="onCreateManual($event)"
    />

    <hk-reservation-detail-drawer
      [reservation]="selected()"
      [tableReservations]="selectedTableReservations()"
      [(state)]="drawerState"
      (confirm)="onConfirm($event)"
      (cancelReservation)="onCancel($event)"
      (call)="onCall($event)"
      (endService)="onFinish($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsPage {
  protected readonly service = inject(ReservationService);
  protected readonly callbacks = inject(CallbackService);
  private readonly toast = inject(ToastService);
  private readonly actions = inject(ReservationActionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly search = signal('');
  // Tri PAR HEURE par defaut : en service on lit la soiree chronologiquement
  // (l'ordre d'insertion API n'a aucun sens metier).
  protected readonly sort = signal<ReservationSort | null>({ key: 'time', dir: 'asc' });
  protected readonly selectedId = signal<string | null>(null);
  protected readonly drawerState = signal<BrnDialogState>('closed');
  // Dialog « Nouvelle réservation » (prise manuelle).
  protected readonly newResaState = signal<BrnDialogState>('closed');
  // Creation manuelle en cours -> desactive le submit du dialog (anti double envoi).
  protected readonly creatingManual = signal(false);

  protected readonly today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Drawer synchronisé par id : reflète toujours l'état à jour du service.
  protected readonly selected = computed(
    () => this.service.reservations().find((r) => r.id === this.selectedId()) ?? null,
  );

  // Resas VIVANTES de la table de la resa affichée (frise « Soirée de la table »).
  protected readonly selectedTableReservations = computed(() => {
    const tableId = this.selected()?.table?.id;
    if (!tableId) {
      return [];
    }
    return this.service
      .reservations()
      .filter(
        (r) =>
          r.table?.id === tableId &&
          (r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated'),
      )
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  });

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
    // Retour depuis la page Plan : donnees deja en memoire -> refresh silencieux
    // (pas de skeletons), sinon chargement initial complet.
    if (this.service.reservations().length > 0) {
      this.service
        .refresh()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          error: () => undefined,
        });
    } else {
      this.service.loadToday();
    }
    this.callbacks.loadPending();

    // LIVE LEGER (LOT B3) : polling partage (ReservationService), la page ne
    // fournit que son delta — le toast d'annonce.
    this.service.startLivePolling(this.destroyRef, {
      onNew: (created) => this.announceNewReservation(created),
    });
  }

  // Toast « Nouvelle réservation » (valorise le bot).
  private announceNewReservation(r: Reservation): void {
    const detail = `${r.customerName}, ${r.partySize} couv., ${formatTime(r.dateTime)}`;
    if (r.source === 'callbot') {
      this.toast.show(`Nouvelle réservation prise par le bot — ${detail}`, 'success');
    } else {
      this.toast.show(`Nouvelle réservation — ${detail}`);
    }
  }

  // NOUVELLE RESERVATION MANUELLE : POST client + resa, puis proposition de
  // placement immediat (toast avec action -> plan preselectionne).
  protected onCreateManual(input: NewReservationInput): void {
    if (this.creatingManual()) {
      return;
    }
    this.creatingManual.set(true);
    this.service
      .createManual(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.creatingManual.set(false);
          this.newResaState.set('closed');
          this.toast.show(`Réservation créée — ${created.customerName}`, 'success', {
            label: 'Placer sur le plan',
            run: () => this.onPlace(created),
          });
        },
        error: () => {
          this.creatingManual.set(false);
          this.toast.show('Échec de la création. Vérifiez le téléphone.', 'error');
        },
      });
  }

  // « Placer » depuis la liste : bascule sur la page Plan avec la resa
  // PRESELECTIONNEE (bandeau d'affectation ouvert, meilleure table surlignee).
  protected onPlace(reservation: Reservation): void {
    void this.router.navigate(['/plan'], { queryParams: { placer: reservation.id } });
  }

  protected openDetail(reservation: Reservation): void {
    this.selectedId.set(reservation.id);
    this.drawerState.set('open');
  }

  // Fin du service (drawer, resa seated) : action partagee + fermeture du drawer.
  protected onFinish(reservation: Reservation): void {
    this.actions.finish(reservation, this.destroyRef, () => this.drawerState.set('closed'));
  }

  protected onConfirm(reservation: Reservation): void {
    this.actions.confirm(reservation, this.destroyRef);
  }

  protected onCancel(reservation: Reservation): void {
    this.actions.cancel(reservation, this.destroyRef);
  }

  protected onCall(reservation: Reservation): void {
    this.actions.call(reservation);
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
