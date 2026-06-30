import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type Konva from 'konva';
import { FloorTableStatus, FloorTableView } from '@core/models/floor-plan.model';

// Type du namespace Konva (import dynamique a l'execution pour ne pas alourdir
// le bundle initial : Konva n'est charge qu'a l'ouverture de la vue Plan).
type KonvaModule = typeof Konva;

// Couleurs de statut pour le canvas (Konva = imperatif, pas de classes CSS).
// On lit les tokens OKLCH du design system depuis le conteneur, avec repli.
// Roles semantiques : libre=neutre, reservee=ambre/warning, installee=vert/success.
interface StatusColors {
  fill: string;
  stroke: string;
  text: string;
}

const COLOR_VARS: Record<FloorTableStatus, { fill: string; stroke: string; text: string }> = {
  libre: {
    fill: '--st-completed-bg',
    stroke: '--border-strong',
    text: '--st-completed-fg',
  },
  reservee: {
    fill: '--st-pending-bg',
    stroke: '--st-pending-fg',
    text: '--st-pending-fg',
  },
  installee: {
    fill: '--st-confirmed-bg',
    stroke: '--st-confirmed-fg',
    text: '--st-confirmed-fg',
  },
};

const FALLBACK_COLORS: Record<FloorTableStatus, StatusColors> = {
  libre: { fill: '#f1f1ef', stroke: '#d6d6d2', text: '#6f6f6a' },
  reservee: { fill: '#fdf0db', stroke: '#a86a16', text: '#a86a16' },
  installee: { fill: '#dcf2e6', stroke: '#1f7a52', text: '#1f7a52' },
};

const ACCENT_VAR = '--green-600';
const ACCENT_FALLBACK = '#2f9e6f';

// Canvas Konva du plan de salle (Phase 1, lecture seule + clic).
// - cree le Stage via viewChild + afterNextRender (app zoneless) ;
// - redessine via un effect() qui lit les inputs (signals) ;
// - recalcule les positions pixel au resize (coords stockees normalisees 0..1) ;
// - le clic Konva met a jour l'etat via l'output tableClick.
@Component({
  selector: 'hk-floor-plan-canvas',
  template: `
    <div
      #host
      class="bg-surface-2 border-border relative w-full overflow-hidden rounded-md border"
      style="aspect-ratio: 16 / 10; min-height: 320px"
    ></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFloorPlanCanvas {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  // Tables a dessiner (position normalisee + statut + reservation deja derives).
  readonly tables = input<FloorTableView[]>([]);
  // Met en evidence les tables libres (pendant l'affectation d'une non placee).
  readonly highlightFree = input(false);

  readonly tableClick = output<FloorTableView>();

  private konva: KonvaModule | null = null;
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(async () => {
      // Import dynamique : Konva n'entre pas dans le bundle initial.
      const mod = await import('konva');
      this.konva = mod.default;
      const container = this.host().nativeElement;
      this.stage = new this.konva.Stage({
        container,
        width: container.clientWidth || 1,
        height: container.clientHeight || 1,
      });
      this.layer = new this.konva.Layer();
      this.stage.add(this.layer);

      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(container);
      this.draw();
    });

    // Redessine quand les inputs changent (lecture de signals = fonctionne sans zone).
    effect(() => {
      // Dependances : tables + surlignage.
      this.tables();
      this.highlightFree();
      this.draw();
    });

    destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.stage?.destroy();
    });
  }

  private syncSize(): void {
    if (!this.stage) {
      return;
    }
    const container = this.host().nativeElement;
    this.stage.size({
      width: container.clientWidth || 1,
      height: container.clientHeight || 1,
    });
    this.draw();
  }

  private draw(): void {
    const k = this.konva;
    if (!k || !this.stage || !this.layer) {
      return;
    }
    this.layer.destroyChildren();

    const width = this.stage.width();
    const height = this.stage.height();
    const tables = this.tables();
    const highlight = this.highlightFree();

    // Taille des tables : fraction du petit cote, bornee pour rester lisible/tactile.
    const base = Math.min(width, height);
    const size = Math.max(44, Math.min(96, base * 0.16));

    for (const view of tables) {
      const colors = this.colorsFor(view.status);
      const cx = view.x * width;
      const cy = view.y * height;
      const isRound = view.table.capacity <= 2;

      const group = new k.Group({
        x: cx,
        y: cy,
        listening: true,
      });

      const showHint = highlight && view.status === 'libre';
      const stroke = showHint ? this.accentColor() : colors.stroke;
      const strokeWidth = showHint ? 3 : 1.5;
      const dash = showHint ? [6, 4] : undefined;

      if (isRound) {
        group.add(
          new k.Circle({
            radius: size / 2,
            fill: colors.fill,
            stroke,
            strokeWidth,
            dash,
          }),
        );
      } else {
        group.add(
          new k.Rect({
            width: size,
            height: size,
            offsetX: size / 2,
            offsetY: size / 2,
            cornerRadius: 10,
            fill: colors.fill,
            stroke,
            strokeWidth,
            dash,
          }),
        );
      }

      // Nom de la table.
      group.add(
        new k.Text({
          text: view.table.name,
          fontSize: 14,
          fontStyle: '600',
          fontFamily: 'inherit',
          fill: colors.text,
          width: size,
          align: 'center',
          offsetX: size / 2,
          offsetY: 12,
        }),
      );
      // Capacite (couverts).
      group.add(
        new k.Text({
          text: `${view.table.capacity} couv.`,
          fontSize: 11,
          fontFamily: 'inherit',
          fill: colors.text,
          width: size,
          align: 'center',
          offsetX: size / 2,
          offsetY: -2,
        }),
      );

      group.on('click tap', () => this.tableClick.emit(view));
      group.on('mouseenter', () => {
        const stage = this.stage;
        if (stage) {
          stage.container().style.cursor = 'pointer';
        }
        group.opacity(0.88);
        this.layer?.batchDraw();
      });
      group.on('mouseleave', () => {
        const stage = this.stage;
        if (stage) {
          stage.container().style.cursor = 'default';
        }
        group.opacity(1);
        this.layer?.batchDraw();
      });

      this.layer.add(group);
    }

    this.layer.draw();
  }

  private colorsFor(status: FloorTableStatus): StatusColors {
    const vars = COLOR_VARS[status];
    const fallback = FALLBACK_COLORS[status];
    return {
      fill: this.readVar(vars.fill, fallback.fill),
      stroke: this.readVar(vars.stroke, fallback.stroke),
      text: this.readVar(vars.text, fallback.text),
    };
  }

  private accentColor(): string {
    return this.readVar(ACCENT_VAR, ACCENT_FALLBACK);
  }

  // Lit une variable CSS du theme (source de verite unique) ; repli si indisponible
  // (ex. environnement de test sans styles charges).
  private readVar(name: string, fallback: string): string {
    const el = this.hostEl.nativeElement;
    const view = el.ownerDocument?.defaultView;
    if (!view) {
      return fallback;
    }
    const value = view.getComputedStyle(el).getPropertyValue(name).trim();
    return value || fallback;
  }
}
