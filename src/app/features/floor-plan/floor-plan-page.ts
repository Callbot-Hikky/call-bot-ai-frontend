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
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import {
  AssignEvent,
  HkFloorPlan,
  MergeAssignEvent,
  WalkInEvent,
} from '@shared/components/organisms/floor-plan/hk-floor-plan';
import { HkServiceOverlay } from '@shared/components/organisms/floor-plan/hk-service-overlay';
import { HkFloorPlanEditor } from '@shared/components/organisms/floor-plan-editor/hk-floor-plan-editor';
import { deriveTableStatus, layoutTables, mergeViews } from '@core/models/floor-plan.model';
import { SessionService } from '@core/services/session.service';
import { ReservationService } from '@core/services/reservation.service';
import { ReservationActionsService } from '@core/services/reservation-actions.service';
import { TableService } from '@core/services/table.service';
import { FloorPlanService } from '@core/services/floor-plan.service';
import { ToastService } from '@core/services/toast.service';
import { Reservation } from '@core/models/reservation.model';
import { formatTime } from '@core/utils/format';

// PAGE DEDIEE « Plan de salle » : le plan respire plein cadre (plus de scroll
// sous les KPI), avec l'editeur, le mode service plein ecran et le drawer de
// detail. La page Reservations garde la liste ; les deux partagent les MEMES
// services (signals) - une affectation faite ici est visible la-bas.
@Component({
  selector: 'app-floor-plan-page',
  imports: [HkPageHeader, HkFloorPlan, HkServiceOverlay, HkFloorPlanEditor],
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
        [(selectedTableId)]="selectedTableId"
        [(view3d)]="view3d"
        [(vitrine)]="vitrine"
        [portrait]="portraitMobile()"
        [loading]="service.loading() || tables.loading()"
        [error]="service.error() || tables.error()"
        (exitService)="exitServiceMode()"
        (assign)="onAssign($event)"
        (assignMany)="onAssignMany($event)"
        (mergeAssign)="onMergeAssign($event)"
        (walkIn)="onWalkIn($event)"
        (unassign)="onUnassign($event)"
        (confirmReservation)="onConfirm($event)"
        (cancelReservation)="onCancel($event)"
        (callReservation)="onCall($event)"
        (finishService)="onFinish($event)"
        (markArrived)="onMarkArrived($event)"
        (retry)="reload()"
      />
    } @else if (portraitMobile()) {
      <!-- MOBILE PORTRAIT : vue TUILES (le plan spatial revient en paysage). -->
      <hk-page-header [subtitle]="today" />
      <hk-floor-plan
        [portrait]="true"
        [reservations]="service.reservations()"
        [tables]="tables.tables()"
        [geometry]="floorPlan.geometry()"
        [walls]="floorPlan.walls()"
        [merges]="floorPlan.merges()"
        [(selectedTableId)]="selectedTableId"
        [preselectId]="placerId()"
        [restaurantName]="restaurantName"
        [loading]="service.loading() || tables.loading()"
        [error]="service.error() || tables.error()"
        (assign)="onAssign($event)"
        (assignMany)="onAssignMany($event)"
        (mergeAssign)="onMergeAssign($event)"
        (walkIn)="onWalkIn($event)"
        (unassign)="onUnassign($event)"
        (confirmReservation)="onConfirm($event)"
        (cancelReservation)="onCancel($event)"
        (callReservation)="onCall($event)"
        (finishService)="onFinish($event)"
        (markArrived)="onMarkArrived($event)"
        (retry)="reload()"
      />
    } @else {
      @if (!editing()) {
        <!-- Paysage compact : chaque pixel vertical compte, l'en-tete saute. -->
        <div class="max-lg:landscape:hidden">
          <hk-page-header [subtitle]="today" />
        </div>
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
            [(selectedTableId)]="selectedTableId"
            [(view3d)]="view3d"
            [(vitrine)]="vitrine"
            [preselectId]="placerId()"
            [restaurantName]="restaurantName"
            [loading]="service.loading() || tables.loading()"
            [error]="service.error() || tables.error()"
            (assign)="onAssign($event)"
            (assignMany)="onAssignMany($event)"
            (mergeAssign)="onMergeAssign($event)"
            (walkIn)="onWalkIn($event)"
            (unassign)="onUnassign($event)"
            (confirmReservation)="onConfirm($event)"
            (cancelReservation)="onCancel($event)"
            (callReservation)="onCall($event)"
            (finishService)="onFinish($event)"
            (markArrived)="onMarkArrived($event)"
            (edit)="onEdit()"
            (enterService)="enterServiceMode()"
            (retry)="reload()"
          />
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloorPlanPage {
  protected readonly service = inject(ReservationService);
  protected readonly tables = inject(TableService);
  protected readonly floorPlan = inject(FloorPlanService);
  private readonly toast = inject(ToastService);
  private readonly actions = inject(ReservationActionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // « Placer » depuis la liste : /plan?placer=<id> -> resa preselectionnee.
  protected readonly placerId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('placer'))),
    { initialValue: null },
  );

  // Mode edition du plan (plein cadre, masque le header de page).
  protected readonly editing = signal(false);
  // MOBILE : petit ecran EN PORTRAIT -> invite a tourner le telephone.
  protected readonly portraitMobile = signal(false);
  // Table selectionnee (inspector) : detenue ICI pour survivre au passage
  // mode normal <-> mode service (deux instances du plan).
  protected readonly selectedTableId = signal<string | null>(null);
  // Vue 2D/3D : detenue ICI aussi, pour survivre au passage mode normal <->
  // service (sinon la 3D retombe en 2D en entrant en service).
  protected readonly view3d = signal(false);
  // Orbite auto de la 3D (Vitrine) : partagee pour survivre a la meme transition.
  protected readonly vitrine = signal(false);
  // MODE SERVICE plein ecran (« poste d'accueil »).
  protected readonly serviceMode = signal(false);
  private readonly session = inject(SessionService);
  protected get restaurantId(): string {
    return this.session.restaurantId() ?? '';
  }
  protected readonly restaurantName = 'Le Bistrot du Coin';
  private enteredFullscreen = false;
  private readonly floorPlanCmp = viewChild(HkFloorPlan);
  // En mode service, le plan est dans l'overlay (pas un enfant direct de la page).
  private readonly serviceOverlayCmp = viewChild(HkServiceOverlay);

  protected readonly today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Synthese de salle du bandeau service (memes derivations que le plan).
  protected readonly serviceTableViews = computed(() => {
    const reservations = this.service.reservations();
    const now = new Date();
    const views = layoutTables(this.tables.tables(), this.floorPlan.geometry()).map((p) => ({
      ...p,
      ...deriveTableStatus(p.table.id, reservations, now),
    }));
    // Tablees fusionnees comptees comme UNE table (meme synthese que le plan).
    return mergeViews(views, this.floorPlan.merges());
  });

  constructor() {
    // Suivi de l'orientation (mobile) : le plan n'est rendu qu'en paysage.
    // Garde jsdom : matchMedia absent en environnement de test.
    if (typeof window.matchMedia === 'function') {
      const portraitQuery = window.matchMedia('(max-width: 767px) and (orientation: portrait)');
      this.portraitMobile.set(portraitQuery.matches);
      const onOrientation = (e: MediaQueryListEvent): void => this.portraitMobile.set(e.matches);
      portraitQuery.addEventListener('change', onOrientation);
      this.destroyRef.onDestroy(() => portraitQuery.removeEventListener('change', onOrientation));
    }

    // Bascule liste <-> plan : si les donnees sont deja en memoire (services
    // partages), refresh silencieux au lieu d'un rechargement avec skeletons.
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
    if (this.tables.tables().length === 0) {
      this.tables.loadTables();
    }
    this.floorPlan.load(this.restaurantId);

    // ?placer= est un evenement ONE-SHOT : consomme puis retire de l'URL (un
    // refresh/bookmark ne rejoue pas la preselection). On NE retire l'URL que
    // lorsque la resa est CHARGEE (donc applicable par le plan) : sinon un
    // chargement lent la ferait disparaitre avant d'avoir ete preselectionnee.
    effect(() => {
      const id = this.placerId();
      if (!id || !this.service.reservations().some((r) => r.id === id)) {
        return;
      }
      setTimeout(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { placer: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }, 1500);
    });

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
      // Quitter la page en plein cadre service (navigation) ne doit pas laisser
      // le plein ecran ni l'orientation verrouilles.
      if (this.serviceMode()) {
        this.exitServiceMode();
      } else {
        document.body.classList.remove('service-mode');
      }
    });

    // LIVE LEGER : polling partage (ReservationService) - pause pendant
    // l'edition du plan, pulse a l'arrivee d'une resa placee.
    this.service.startLivePolling(this.destroyRef, {
      isActive: () => !this.editing(),
      onNew: (created) => this.announceNewReservation(created),
    });
  }

  // Toast « Nouvelle reservation » + pulse de la table si placee (plan affiche).
  private announceNewReservation(r: Reservation): void {
    const detail = `${r.customerName}, ${r.partySize} couv., ${formatTime(r.dateTime)}`;
    if (r.source === 'callbot') {
      this.toast.show(`Nouvelle réservation prise par le bot - ${detail}`, 'success');
    } else {
      this.toast.show(`Nouvelle réservation - ${detail}`);
    }
    if (r.table && !this.editing()) {
      // Le plan est soit direct (mode normal), soit dans l'overlay (mode service).
      if (this.serviceMode()) {
        this.serviceOverlayCmp()?.pulseTable(r.table.id);
      } else {
        this.floorPlanCmp()?.pulseTable(r.table.id);
      }
    }
  }

  // Sort de l'editeur (« Terminer ») : le plan lecture seule revient.
  protected onEditorFinish(): void {
    this.editing.set(false);
  }

  // L'EDITION du plan demande la souris (drag precis, poignees) : sur petit
  // ecran on l'assume honnetement plutot que d'offrir une experience ratee.
  protected onEdit(): void {
    // On mesure la PLUS PETITE dimension : un telephone en paysage est large mais
    // bas (~390px de haut) et resterait sous le seuil, la ou une tablette passe.
    // Cela evite d'ouvrir l'editeur (drag precis) sur un telephone tourne.
    if (Math.min(window.innerWidth, window.innerHeight) < 700) {
      this.toast.show('Modifiez votre salle sur ordinateur ou tablette (gestes de précision).');
      return;
    }
    this.editing.set(true);
  }

  protected enterServiceMode(): void {
    this.serviceMode.set(true);
    document.body.classList.add('service-mode');
    try {
      const req = document.documentElement.requestFullscreen?.();
      if (req) {
        this.enteredFullscreen = true;
        req
          .then(() => {
            // MOBILE : verrouille le paysage quand l'API le permet (Android en
            // plein ecran) ; ailleurs, l'invite « tournez votre telephone » reste.
            const orientation = screen.orientation as ScreenOrientation & {
              lock?: (o: string) => Promise<void>;
            };
            orientation.lock?.('landscape').catch(() => undefined);
          })
          .catch(() => (this.enteredFullscreen = false));
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
    // Symetrique du lock d'entree : sinon l'ecran reste bloque en paysage pour
    // toute l'app apres avoir quitte le service (Android/PWA plein ecran).
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
    this.enteredFullscreen = false;
  }

  protected reload(): void {
    this.service.loadToday();
    this.tables.loadTables();
  }

  protected onAssign(event: AssignEvent): void {
    this.actions.assign(event, this.destroyRef);
  }

  protected onAssignMany(events: AssignEvent[]): void {
    this.actions.assignMany(events, this.destroyRef);
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
    this.actions.walkIn(event, this.destroyRef);
  }

  protected onFinish(reservation: Reservation): void {
    this.actions.finish(reservation, this.destroyRef);
  }

  protected onMarkArrived(reservation: Reservation): void {
    this.actions.markArrived(reservation, this.destroyRef);
  }

  protected onUnassign(reservation: Reservation): void {
    this.actions.unassign(reservation, this.destroyRef);
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
}
