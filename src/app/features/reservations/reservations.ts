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
import {
  AssignEvent,
  HkFloorPlan,
  WalkInEvent,
} from '@shared/components/organisms/floor-plan/hk-floor-plan';
import { HkServiceOverlay } from '@shared/components/organisms/floor-plan/hk-service-overlay';
import { HkFloorPlanEditor } from '@shared/components/organisms/floor-plan-editor/hk-floor-plan-editor';
import { deriveTableStatus, layoutTables } from '@core/models/floor-plan.model';
import { environment } from '@env/environment';
import { ReservationService } from '@core/services/reservation.service';
import { TableService } from '@core/services/table.service';
import { FloorPlanService } from '@core/services/floor-plan.service';
import { CallbackService } from '@core/services/callback.service';
import { ToastService } from '@core/services/toast.service';
import { Reservation, ReservationStatus, newReservations } from '@core/models/reservation.model';
import { CallbackRequest } from '@core/models/callback-request.model';
import { formatTime } from '@core/utils/format';

// Intervalle du polling live (LOT B3) : leger, suffisant pour la demo.
const POLL_INTERVAL_MS = 20_000;

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
        [loading]="service.loading() || tables.loading()"
        [error]="service.error() || tables.error()"
        (exitService)="exitServiceMode()"
        (openReservation)="openDetail($event, true)"
        (assign)="onAssign($event)"
        (walkIn)="onWalkIn($event)"
        (unassign)="onUnassign($event)"
        (retry)="reload()"
      />
    } @else {
      <hk-page-header [subtitle]="today">
        <hk-button variant="secondary" size="sm">Aujourd'hui</hk-button>
        <hk-button size="sm">Nouvelle réservation</hk-button>
      </hk-page-header>

      <div class="flex flex-col gap-6">
        <!-- Pendant l'edition du plan : on masque KPI + demandes de rappel pour
           laisser l'editeur respirer plein cadre (A4). -->
        @if (!editing()) {
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
        }

        @if (editing()) {
          <hk-floor-plan-editor
            [restaurantId]="restaurantId"
            [reservations]="service.reservations()"
            (closed)="onEditorFinish()"
          />
        } @else if (view() === 'list') {
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
            [geometry]="floorPlan.geometry()"
            [loading]="service.loading() || tables.loading()"
            [error]="service.error() || tables.error()"
            (openReservation)="openDetail($event, true)"
            (assign)="onAssign($event)"
            (walkIn)="onWalkIn($event)"
            (unassign)="onUnassign($event)"
            (edit)="onEdit()"
            (enterService)="enterServiceMode()"
            (retry)="reload()"
          />
        }
      </div>
    }

    <hk-reservation-detail-drawer
      [reservation]="selected()"
      [(state)]="drawerState"
      [showUnassign]="drawerFromPlan()"
      (confirm)="onConfirm($event)"
      (cancelReservation)="onCancel($event)"
      (call)="onCall($event)"
      (unassign)="onUnassign($event)"
      (endService)="onFinish($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsPage {
  protected readonly service = inject(ReservationService);
  protected readonly tables = inject(TableService);
  // Plan de salle edite (geometrie localStorage) : lu par la vue service (bridge).
  protected readonly floorPlan = inject(FloorPlanService);
  protected readonly callbacks = inject(CallbackService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly view = signal<ReservationView>('list');
  // Mode edition du plan de salle (Phase 2). Masque le toggle + le plan lecture seule.
  protected readonly editing = signal(false);
  // MODE SERVICE plein ecran (« poste d'accueil »). Quand actif, on N'AFFICHE QUE
  // l'overlay (KPI / rappels / toggle masques). Sortie : bouton Quitter ou Echap.
  protected readonly serviceMode = signal(false);
  protected readonly restaurantId = environment.restaurantId;
  // Nom du restaurant affiche dans le bandeau du mode service (pas d'API dediee).
  protected readonly restaurantName = 'Le Bistrot du Coin';
  // Vrai plein ecran navigateur engage par nous (pour resynchroniser a sa sortie).
  private enteredFullscreen = false;
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly search = signal('');
  protected readonly sort = signal<ReservationSort | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly drawerState = signal<BrnDialogState>('closed');
  // Vrai si le drawer a ete ouvert depuis le plan (active l'action "Liberer la table").
  protected readonly drawerFromPlan = signal(false);
  // Charge les tables une seule fois, au premier passage en vue Plan.
  private tablesLoaded = false;
  // Plan de salle affiche (present uniquement en vue Plan, hors edition) : cible du pulse.
  private readonly floorPlanCmp = viewChild(HkFloorPlan);
  // Timer du polling live (LOT B3) ; null quand le polling est en pause.
  private pollTimer: ReturnType<typeof setInterval> | null = null;

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

  // MODE SERVICE : tables positionnees + statut derive (meme derivation que le plan),
  // pour la synthese de salle du bandeau (libres/reservees/installees/couverts).
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
    this.callbacks.loadPending();

    // Le vrai plein ecran peut etre quitte par le navigateur (Echap natif, F11...) :
    // on resynchronise le mode service pour ne pas rester bloque dans l'overlay.
    const onFsChange = (): void => {
      if (this.enteredFullscreen && !document.fullscreenElement && this.serviceMode()) {
        this.exitServiceMode();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('fullscreenchange', onFsChange);
      // Filet de securite : ne jamais laisser le header masque si on quitte la page
      // en plein mode service.
      document.body.classList.remove('service-mode');
    });

    // LIVE LEGER (LOT B3) : polling silencieux des reservations toutes les 20 s,
    // actif seulement page visible ET hors mode edition. La logique vit ICI (et pas
    // dans un service) : c'est la page qui connait le mode edition, la vue courante
    // (pulse seulement en vue Plan) et qui possede deja ToastService.
    effect(() => {
      this.editing(); // dependance : entree/sortie du mode edition.
      this.syncPolling(false);
    });

    // Onglet cache -> pause ; visible -> refresh immediat + reprise.
    const onVisibility = (): void => this.syncPolling(true);
    document.addEventListener('visibilitychange', onVisibility);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      this.stopPolling();
    });
  }

  // (Re)configure le polling selon l'etat courant (edition + visibilite de l'onglet).
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

  // Re-fetch SILENCIEUX (pas de spinner : refresh() ne touche pas `loading`), puis
  // diff par id -> toast pour chaque nouvelle reservation, pulse si elle est placee.
  private refreshSilently(): void {
    if (this.service.loading()) {
      return; // chargement initial (ou reessai) en cours : inutile de doubler.
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
        // Echec silencieux : le prochain tick retentera (pas de bandeau d'erreur).
        error: () => undefined,
      });
  }

  // Toast « Nouvelle réservation » (valorise le bot) + pulse de la table si placee
  // et que le plan est affiche.
  private announceNewReservation(r: Reservation): void {
    const detail = `${r.customerName}, ${r.partySize} couv., ${formatTime(r.dateTime)}`;
    if (r.source === 'callbot') {
      this.toast.show(`Nouvelle réservation prise par le bot — ${detail}`, 'success');
    } else {
      this.toast.show(`Nouvelle réservation — ${detail}`);
    }
    if (r.table && this.view() === 'plan' && !this.editing()) {
      this.floorPlanCmp()?.pulseTable(r.table.id);
    }
  }

  // Bascule de vue + chargement paresseux des tables au 1er passage en vue Plan
  // (declenchement explicite plutot qu'un effect a effet de bord).
  protected onViewChange(view: ReservationView): void {
    this.view.set(view);
    if (view === 'plan' && !this.tablesLoaded) {
      this.tablesLoaded = true;
      this.tables.loadTables();
      // Charge aussi la geometrie sauvegardee du plan (bridge editeur -> service).
      this.floorPlan.load(this.restaurantId);
    }
  }

  // Entre dans l'editeur de plan (bouton « Modifier » de la vue Plan).
  protected onEdit(): void {
    this.editing.set(true);
  }

  // Sort de l'editeur (« Terminer ») et recharge les tables pour refleter
  // d'eventuels changements cote service (le plan editable est persiste a part).
  protected onEditorFinish(): void {
    this.editing.set(false);
  }

  // MODE SERVICE : entre dans l'overlay plein ecran + tente le vrai plein ecran
  // navigateur (best-effort : si refuse/indispo, l'overlay CSS suffit).
  protected enterServiceMode(): void {
    this.serviceMode.set(true);
    // Masque le header sticky de l'app (z 1010) : l'overlay (z-50) ne pouvait pas
    // passer au-dessus. Une classe sur <body> + une regle globale le cachent ; le
    // drawer (portail CDK ~1000) reste bien au-dessus de l'overlay.
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

  // Sortie du mode service (bouton Quitter, Echap, ou sortie du plein ecran natif).
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

  // WALK-IN : clients sans reservation installes depuis le plan (POST immediat,
  // la table passe bleue via les signals du service).
  protected onWalkIn(event: WalkInEvent): void {
    this.service
      .createWalkIn(event.table, event.partySize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toast.show(`Clients installés en ${event.table.name}`, 'success'),
        error: () => this.toast.show("Échec de l'installation", 'error'),
      });
  }

  // Fin du service (drawer, resa seated) : la resa passe completed, la table
  // redevient libre par derivation.
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
