import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkReservationDetailDrawer } from '@shared/components/organisms/reservation-detail-drawer/hk-reservation-detail-drawer';
import {
  AssignEvent,
  HkFloorPlan,
  MergeAssignEvent,
  WalkInEvent,
} from '@shared/components/organisms/floor-plan/hk-floor-plan';
import { HkServiceOverlay } from '@shared/components/organisms/floor-plan/hk-service-overlay';
import { HkFloorPlanEditor } from '@shared/components/organisms/floor-plan-editor/hk-floor-plan-editor';
import { deriveTableStatus, layoutTables } from '@core/models/floor-plan.model';
import { environment } from '@env/environment';
import { ReservationService } from '@core/services/reservation.service';
import { TableService } from '@core/services/table.service';
import { FloorPlanService } from '@core/services/floor-plan.service';
import { ToastService } from '@core/services/toast.service';
import { Reservation, newReservations } from '@core/models/reservation.model';
import { formatTime } from '@core/utils/format';

// Intervalle du polling live : identique a la page Reservations.
const POLL_INTERVAL_MS = 20_000;

// PAGE DEDIEE « Plan de salle » : le plan respire plein cadre (plus de scroll
// sous les KPI), avec l'editeur, le mode service plein ecran et le drawer de
// detail. La page Reservations garde la liste ; les deux partagent les MEMES
// services (signals) — une affectation faite ici est visible la-bas.
@Component({
  selector: 'app-floor-plan-page',
  imports: [
    HkPageHeader,
    HkReservationDetailDrawer,
    HkFloorPlan,
    HkServiceOverlay,
    HkFloorPlanEditor,
  ],
  template: `
    @if (serviceMode()) {
      <hk-service-overlay
        [restaurantName]="restaurantName"
        [today]="today"
        [views]="serviceTableViews()"
        [reservations]="service.reservations()"
        [tables]="tables.tables()"
        [geometry]="floorPlan.geometry()"
        [walls]="floorPlan.walls()"
        [merges]="floorPlan.merges()"
        [focusTableId]="drawerFocusTableId()"
        [loading]="service.loading() || tables.loading()"
        [error]="service.error() || tables.error()"
        (exitService)="exitServiceMode()"
        (openReservation)="openDetail($event)"
        (assign)="onAssign($event)"
        (mergeAssign)="onMergeAssign($event)"
        (walkIn)="onWalkIn($event)"
        (unassign)="onUnassign($event)"
        (retry)="reload()"
      />
    } @else {
      @if (!editing()) {
        <hk-page-header [subtitle]="today" />
      }

      <div class="flex flex-col gap-6">
        @if (editing()) {
          <hk-floor-plan-editor
            [restaurantId]="restaurantId"
            [reservations]="service.reservations()"
            (closed)="onEditorFinish()"
          />
        } @else {
          <hk-floor-plan
            [reservations]="service.reservations()"
            [tables]="tables.tables()"
            [geometry]="floorPlan.geometry()"
            [walls]="floorPlan.walls()"
            [merges]="floorPlan.merges()"
            [focusTableId]="drawerFocusTableId()"
            [preselectId]="placerId()"
            [restaurantName]="restaurantName"
            [loading]="service.loading() || tables.loading()"
            [error]="service.error() || tables.error()"
            (openReservation)="openDetail($event)"
            (assign)="onAssign($event)"
            (mergeAssign)="onMergeAssign($event)"
            (walkIn)="onWalkIn($event)"
            (unassign)="onUnassign($event)"
            (edit)="editing.set(true)"
            (enterService)="enterServiceMode()"
            (retry)="reload()"
          />
        }
      </div>
    }

    <hk-reservation-detail-drawer
      [reservation]="selected()"
      [tableReservations]="selectedTableReservations()"
      [(state)]="drawerState"
      [showUnassign]="true"
      (confirm)="onConfirm($event)"
      (cancelReservation)="onCancel($event)"
      (call)="onCall($event)"
      (unassign)="onUnassign($event)"
      (endService)="onFinish($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloorPlanPage {
  protected readonly service = inject(ReservationService);
  protected readonly tables = inject(TableService);
  protected readonly floorPlan = inject(FloorPlanService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  // « Placer » depuis la liste : /plan?placer=<id> -> resa preselectionnee.
  protected readonly placerId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('placer'))),
    { initialValue: null },
  );

  // Mode edition du plan (plein cadre, masque le header de page).
  protected readonly editing = signal(false);
  // MODE SERVICE plein ecran (« poste d'accueil »).
  protected readonly serviceMode = signal(false);
  protected readonly restaurantId = environment.restaurantId;
  protected readonly restaurantName = 'Le Bistrot du Coin';
  private enteredFullscreen = false;
  protected readonly selectedId = signal<string | null>(null);
  protected readonly drawerState = signal<BrnDialogState>('closed');
  private readonly floorPlanCmp = viewChild(HkFloorPlan);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Drawer synchronise par id : reflete toujours l'etat a jour du service.
  protected readonly selected = computed(
    () => this.service.reservations().find((r) => r.id === this.selectedId()) ?? null,
  );

  // FOCUS PLAN : drawer ouvert -> la table de la resa affichee reste allumee.
  protected readonly drawerFocusTableId = computed(() =>
    this.drawerState() === 'open' ? (this.selected()?.table?.id ?? null) : null,
  );

  // Resas VIVANTES de la table de la resa affichee (frise « Soiree de la table »).
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

  // Synthese de salle du bandeau service (memes derivations que le plan).
  protected readonly serviceTableViews = computed(() => {
    const reservations = this.service.reservations();
    const now = new Date();
    return layoutTables(this.tables.tables(), this.floorPlan.geometry()).map((p) => ({
      ...p,
      ...deriveTableStatus(p.table.id, reservations, now),
    }));
  });

  constructor() {
    this.service.loadToday();
    this.tables.loadTables();
    this.floorPlan.load(this.restaurantId);

    // Le vrai plein ecran peut etre quitte par le navigateur (Echap natif...) :
    // on resynchronise le mode service pour ne pas rester bloque dans l'overlay.
    const onFsChange = (): void => {
      if (this.enteredFullscreen && !document.fullscreenElement && this.serviceMode()) {
        this.exitServiceMode();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.body.classList.remove('service-mode');
    });

    // LIVE LEGER : polling silencieux des reservations, page visible et hors edition.
    effect(() => {
      this.editing();
      this.syncPolling(false);
    });
    const onVisibility = (): void => this.syncPolling(true);
    document.addEventListener('visibilitychange', onVisibility);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      this.stopPolling();
    });
  }

  private syncPolling(refreshNow: boolean): void {
    const active = !this.editing() && document.visibilityState === 'visible';
    if (!active) {
      this.stopPolling();
      return;
    }
    if (refreshNow) {
      this.refreshSilently();
    }
    if (this.pollTimer === null) {
      this.pollTimer = setInterval(() => this.refreshSilently(), POLL_INTERVAL_MS);
    }
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private refreshSilently(): void {
    if (this.service.loading()) {
      return;
    }
    const beforeIds = new Set(this.service.reservations().map((r) => r.id));
    this.service
      .refresh()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          for (const r of newReservations(beforeIds, list)) {
            this.announceNewReservation(r);
          }
        },
        error: () => undefined,
      });
  }

  // Toast « Nouvelle reservation » + pulse de la table si placee (plan affiche).
  private announceNewReservation(r: Reservation): void {
    const detail = `${r.customerName}, ${r.partySize} couv., ${formatTime(r.dateTime)}`;
    if (r.source === 'callbot') {
      this.toast.show(`Nouvelle réservation prise par le bot — ${detail}`, 'success');
    } else {
      this.toast.show(`Nouvelle réservation — ${detail}`);
    }
    if (r.table && !this.editing()) {
      this.floorPlanCmp()?.pulseTable(r.table.id);
    }
  }

  // Sort de l'editeur (« Terminer ») : le plan lecture seule revient.
  protected onEditorFinish(): void {
    this.editing.set(false);
  }

  protected enterServiceMode(): void {
    this.serviceMode.set(true);
    document.body.classList.add('service-mode');
    try {
      const req = document.documentElement.requestFullscreen?.();
      if (req) {
        this.enteredFullscreen = true;
        req.catch(() => (this.enteredFullscreen = false));
      }
    } catch {
      this.enteredFullscreen = false;
    }
  }

  protected exitServiceMode(): void {
    this.serviceMode.set(false);
    document.body.classList.remove('service-mode');
    if (document.fullscreenElement) {
      try {
        document.exitFullscreen?.();
      } catch {
        // Sortie de plein ecran refusee : sans consequence, l'overlay est deja masque.
      }
    }
    this.enteredFullscreen = false;
  }

  protected openDetail(reservation: Reservation): void {
    this.selectedId.set(reservation.id);
    this.drawerState.set('open');
  }

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

  // FUSION GUIDEE : fusion d'abord (autosave du plan), affectation sur l'ANCRE.
  protected onMergeAssign(event: MergeAssignEvent): void {
    const others = this.floorPlan
      .merges()
      .filter((group) => !group.some((id) => event.tableIds.includes(id)));
    this.floorPlan.setMerges([...others, event.tableIds]);
    this.service
      .assign(event.reservationId, event.table)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.show('Tablée créée et réservation placée', 'success'),
        error: () => this.toast.show("Échec de l'affectation", 'error'),
      });
  }

  protected onWalkIn(event: WalkInEvent): void {
    this.service
      .createWalkIn(event.table, event.partySize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.show(`Clients installés en ${event.table.name}`, 'success'),
        error: () => this.toast.show("Échec de l'installation", 'error'),
      });
  }

  protected onFinish(reservation: Reservation): void {
    this.service
      .finish(reservation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.show('Table libérée — service terminé', 'success');
          this.drawerState.set('closed');
        },
        error: () => this.toast.show('Échec de la clôture', 'error'),
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
}
