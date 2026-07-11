import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkFloorPlan, AssignEvent, WalkInEvent } from './hk-floor-plan';
import { Reservation } from '@core/models/reservation.model';
import { FloorTable } from '@core/models/table.model';
import { FloorTableView, summarizeRoom } from '@core/models/floor-plan.model';
import { GeometryMap, WallSegment } from '@core/models/floor-plan-editor.model';

// MODE SERVICE plein ecran (« poste d'accueil / ecran mural »).
// Overlay CSS (fixed inset-0) qui prend tout l'ecran : bandeau de service (resto,
// date, grosse horloge, synthese de salle, « En direct », Quitter) + le plan en
// GRAND (hk-floor-plan en mode service : remplit la hauteur, noms clients affiches).
//
// Composant DEDIE (et non inline dans la page) : isole la logique horloge/Echap/
// synthese et la rend testable sans monter toute la page. La page se contente de
// l'afficher/masquer et de gerer le vrai plein ecran navigateur.
@Component({
  selector: 'hk-service-overlay',
  imports: [HkButton, HkIcon, HkFloorPlan],
  host: {
    class: 'bg-background fixed inset-0 z-50 flex flex-col',
  },
  template: `
    <header class="border-border flex items-center justify-between gap-4 border-b px-6 py-3">
      <div class="flex items-baseline gap-3">
        <span class="text-text-strong text-lg font-semibold">{{ restaurantName() }}</span>
        <span class="text-text-muted text-sm capitalize">{{ today() }}</span>
        <span class="text-text-strong ml-1 font-mono text-3xl font-bold tabular-nums">
          {{ clock() }}
        </span>
      </div>

      <div
        class="text-text-muted flex flex-1 flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm"
      >
        <span class="inline-flex items-center gap-1.5">
          <span class="border-border-strong bg-surface size-2.5 rounded-full border"></span>
          {{ summary().libres }} libres
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bg-st-confirmed-fg size-2.5 rounded-full"></span>
          {{ summary().reservees }} réservées
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bg-st-seated-fg size-2.5 rounded-full"></span>
          {{ summary().installees }} installées
        </span>
        <span class="text-text-strong font-semibold">{{ summary().couverts }} couverts</span>
      </div>

      <div class="flex items-center gap-4">
        <span class="text-text-muted inline-flex items-center gap-1.5 text-sm">
          <span class="size-2.5 animate-pulse rounded-full bg-green-500"></span>
          En direct
        </span>
        <hk-button variant="secondary" (click)="exitService.emit()">
          <hk-icon name="lucideX" [size]="18" />
          Quitter
        </hk-button>
      </div>
    </header>

    <div class="min-h-0 flex-1 p-4">
      <hk-floor-plan
        class="block h-full min-h-0"
        [serviceMode]="true"
        [reservations]="reservations()"
        [tables]="tables()"
        [geometry]="geometry()"
        [walls]="walls()"
        [loading]="loading()"
        [error]="error()"
        (openReservation)="openReservation.emit($event)"
        (assign)="assign.emit($event)"
        (walkIn)="walkIn.emit($event)"
        (unassign)="unassign.emit($event)"
        (retry)="retry.emit()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkServiceOverlay {
  // Nom du restaurant + date du jour affiches dans le bandeau.
  readonly restaurantName = input('Le Bistrot du Coin');
  readonly today = input('');

  // Vues de tables (statut derive) pour la synthese de salle.
  readonly views = input<FloorTableView[]>([]);

  // Passe-plats vers hk-floor-plan.
  readonly reservations = input<Reservation[]>([]);
  readonly tables = input<FloorTable[]>([]);
  readonly geometry = input<GeometryMap>({});
  readonly walls = input<WallSegment[]>([]);
  readonly loading = input(false);
  readonly error = input(false);

  // Sortie du mode service (Quitter OU Echap). Nom NON DOM-natif.
  readonly exitService = output<void>();
  // Passe-plats des interactions plan (la page garde ses handlers).
  readonly openReservation = output<Reservation>();
  readonly assign = output<AssignEvent>();
  readonly walkIn = output<WalkInEvent>();
  readonly unassign = output<Reservation>();
  readonly retry = output<void>();

  // Synthese de salle (libres / reservees / installees / couverts) : pure, depuis
  // les vues de tables.
  protected readonly summary = computed(() => summarizeRoom(this.views()));

  // HORLOGE : mise a jour chaque minute via setInterval (nettoye au destroy). Pas
  // de zone -> l'ecriture du signal declenche la detection de changement.
  private readonly nowMinute = signal(new Date());
  protected readonly clock = computed(() =>
    this.nowMinute().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  );

  constructor() {
    const timer = setInterval(() => this.nowMinute.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  // Echap : sortie du mode service (equivalent au bouton Quitter).
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.exitService.emit();
  }
}
