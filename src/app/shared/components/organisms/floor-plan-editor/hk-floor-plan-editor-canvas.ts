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
import {
  EditorTable,
  WallSegment,
  clamp,
  snapToGrid,
  tableSizePx,
} from '@core/models/floor-plan-editor.model';
import {
  applyTableShadow,
  layoutSeats,
  styleSeats,
  syncSeatCount,
} from '../floor-plan/konva-table-style';

type KonvaModule = typeof Konva;

// Geometrie normalisee renvoyee a l'orchestrateur apres un geste (drag/resize/rotate).
export interface TableGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

// Couleurs de l'editeur : tables NEUTRES (pas de statut). Selection = contour accent.
const NEUTRAL_FILL_VAR = '--surface';
const NEUTRAL_FILL_FALLBACK = '#ffffff';
const NEUTRAL_STROKE_VAR = '--border-strong';
const NEUTRAL_STROKE_FALLBACK = '#d6d6d2';
const TEXT_VAR = '--text';
const TEXT_FALLBACK = '#37352f';
const ACCENT_VAR = '--green-600';
const ACCENT_FALLBACK = '#2f9e6f';
const GRID_VAR = '--border';
const GRID_FALLBACK = '#ededec';

// Bornes pixel d'une table (lisible / tactile) — sert au resize.
const MIN_SIZE_PX = 32;

// Noeud persistant d'une table editable.
interface EditorNode {
  group: Konva.Group;
  shape: Konva.Shape; // Circle (rond) ou Rect.
  // Sieges autour de la table (meme rendu que la vue service, en neutre).
  seats: Konva.Group;
  label: Konva.Text;
  isRound: boolean;
}

// Canvas Konva EDITABLE (Phase 2).
//
// Controle par l'orchestrateur : recoit `tables` (modele normalise 0..1) + `selectedIds`,
// et REMONTE les changements via outputs. Il ne mute jamais le modele lui-meme :
//  - pendant un drag/resize, il bouge les noeuds Konva en direct (fluide) ;
//  - a la fin du geste (dragend/transformend), il emet la geometrie normalisee,
//    l'orchestrateur commit (1 geste = 1 entree d'historique).
//
// Noeuds PERSISTANTS (meme principe que le canvas service refactore) : on cree a
// l'ajout, on reutilise/maj ensuite, on ne detruit que les disparus.
@Component({
  selector: 'hk-floor-plan-editor-canvas',
  template: `
    <div
      #host
      tabindex="0"
      role="application"
      aria-label="Éditeur de plan de salle. Glissez les tables pour les déplacer."
      class="bg-surface-2 border-border focus-visible:ring-primary relative w-full cursor-crosshair overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
      style="aspect-ratio: 16 / 10; min-height: 360px"
    ></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFloorPlanEditorCanvas {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  readonly tables = input<EditorTable[]>([]);
  // Murs decoratifs (import Pascal OU traces a la main) : sous les tables.
  readonly walls = input<WallSegment[]>([]);
  readonly selectedIds = input<readonly string[]>([]);
  readonly snap = input(true);
  // MODE MURS : deux clics = un mur. Les tables sont gelees pendant le trace.
  readonly wallMode = input(false);

  // Selection demandee depuis le canvas (clic table, clic vide, rubber-band).
  readonly selectionChange = output<string[]>();
  // Geometrie d'une ou plusieurs tables apres un geste (a commiter en bloc).
  readonly geometryChange = output<TableGeometry[]>();
  // Mur trace (coordonnees normalisees) : l'orchestrateur le persiste.
  readonly wallAdded = output<WallSegment>();

  private konva: KonvaModule | null = null;
  private stage: Konva.Stage | null = null;
  private gridLayer: Konva.Layer | null = null;
  private layer: Konva.Layer | null = null;
  private transformer: Konva.Transformer | null = null;
  private selectionRect: Konva.Rect | null = null;

  private readonly nodes = new Map<string, EditorNode>();
  private rubberStart: { x: number; y: number } | null = null;

  // MODE MURS : premier point pose (px) + apercu du trace en cours.
  private wallStart: { x: number; y: number } | null = null;
  private wallPreview: Konva.Line | null = null;
  private wallStartMarker: Konva.Circle | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(async () => {
      const mod = await import('konva');
      this.konva = mod.default;
      this.initStage();
      this.render();
      this.syncSelection();
    });

    // Reconcilie les noeuds quand le modele change (tables OU murs).
    effect(() => {
      this.tables();
      this.walls();
      this.render();
    });

    // Applique la selection (Transformer) quand selectedIds change.
    effect(() => {
      this.selectedIds();
      this.syncSelection();
    });

    // MODE MURS : gele les tables (pas de drag/selection pendant le trace),
    // curseur croix, et nettoie un trace en cours a la sortie du mode.
    effect(() => {
      const drawing = this.wallMode();
      for (const node of this.nodes.values()) {
        node.group.draggable(!drawing);
        node.group.listening(!drawing);
      }
      if (!drawing) {
        this.resetWallDraft();
      }
      this.layer?.batchDraw();
    });

    destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      cancelAnimationFrame(this.resizeRaf);
      this.stage?.destroy();
    });
  }

  private resizeObserver: ResizeObserver | null = null;
  private resizeRaf = 0;

  private initStage(): void {
    const k = this.konva!;
    const container = this.host().nativeElement;
    this.stage = new k.Stage({
      container,
      width: container.clientWidth || 1,
      height: container.clientHeight || 1,
    });

    this.gridLayer = new k.Layer({ listening: false });
    this.layer = new k.Layer();
    this.stage.add(this.gridLayer);
    this.stage.add(this.layer);

    this.transformer = new k.Transformer({
      rotateEnabled: true,
      borderStroke: this.readVar(ACCENT_VAR, ACCENT_FALLBACK),
      anchorStroke: this.readVar(ACCENT_VAR, ACCENT_FALLBACK),
      anchorFill: '#ffffff',
      anchorSize: 9,
      // Empeche un retournement / une taille nulle.
      boundBoxFunc: (oldBox, newBox) =>
        newBox.width < MIN_SIZE_PX || newBox.height < MIN_SIZE_PX ? oldBox : newBox,
    });
    this.layer.add(this.transformer);

    this.selectionRect = new k.Rect({
      fill: this.readVar(ACCENT_VAR, ACCENT_FALLBACK),
      opacity: 0.12,
      stroke: this.readVar(ACCENT_VAR, ACCENT_FALLBACK),
      strokeWidth: 1,
      visible: false,
      listening: false,
    });
    this.layer.add(this.selectionRect);

    // Resize : on re-layout (coords normalisees -> pixels) sans recreer.
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = requestAnimationFrame(() => this.syncSize());
    });
    this.resizeObserver.observe(container);

    this.bindStageInteractions();
  }

  // Clic dans le vide = deselection + depart d'un rectangle de selection.
  // En MODE MURS, le clic pose les points du mur a la place.
  private bindStageInteractions(): void {
    const stage = this.stage!;
    stage.on('mousedown touchstart', (e) => {
      if (this.wallMode()) {
        this.handleWallClick();
        return;
      }
      if (e.target !== stage) {
        return; // clic sur une table : gere par le groupe.
      }
      const pos = stage.getPointerPosition();
      if (!pos) {
        return;
      }
      this.rubberStart = { x: pos.x, y: pos.y };
      this.selectionRect?.setAttrs({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        visible: true,
      });
    });

    stage.on('mousemove touchmove', () => {
      if (this.wallMode()) {
        this.updateWallPreview();
        return;
      }
      if (!this.rubberStart || !this.selectionRect) {
        return;
      }
      const pos = stage.getPointerPosition();
      if (!pos) {
        return;
      }
      const x = Math.min(this.rubberStart.x, pos.x);
      const y = Math.min(this.rubberStart.y, pos.y);
      this.selectionRect.setAttrs({
        x,
        y,
        width: Math.abs(pos.x - this.rubberStart.x),
        height: Math.abs(pos.y - this.rubberStart.y),
      });
      this.layer?.batchDraw();
    });

    stage.on('mouseup touchend', () => {
      if (this.wallMode()) {
        return; // les murs se tracent au mousedown, pas de rubber-band.
      }
      if (!this.rubberStart || !this.selectionRect) {
        return;
      }
      const box = this.selectionRect.getClientRect();
      this.selectionRect.visible(false);
      const dragged = this.selectionRect.width() > 4 || this.selectionRect.height() > 4;
      this.rubberStart = null;
      this.layer?.batchDraw();

      if (!dragged) {
        // Simple clic dans le vide : on deselectionne tout.
        this.selectionChange.emit([]);
        return;
      }
      const k = this.konva!;
      const hits: string[] = [];
      for (const [id, node] of this.nodes) {
        if (k.Util.haveIntersection(box, node.group.getClientRect())) {
          hits.push(id);
        }
      }
      this.selectionChange.emit(hits);
    });
  }

  // --- MODE MURS ----------------------------------------------------------------

  // Premier clic : pose le depart (marqueur + apercu). Second clic : emet le mur
  // en coordonnees NORMALISEES (l'orchestrateur persiste via FloorPlanService).
  private handleWallClick(): void {
    const k = this.konva;
    const stage = this.stage;
    const pos = stage?.getPointerPosition();
    if (!k || !stage || !pos) {
      return;
    }
    if (!this.wallStart) {
      this.wallStart = { x: pos.x, y: pos.y };
      const color = this.readVar(NEUTRAL_STROKE_VAR, NEUTRAL_STROKE_FALLBACK);
      this.wallStartMarker = new k.Circle({
        x: pos.x,
        y: pos.y,
        radius: 5,
        fill: color,
        listening: false,
      });
      this.wallPreview = new k.Line({
        points: [pos.x, pos.y, pos.x, pos.y],
        stroke: color,
        strokeWidth: 6,
        lineCap: 'round',
        dash: [10, 6],
        opacity: 0.7,
        listening: false,
      });
      this.layer?.add(this.wallPreview);
      this.layer?.add(this.wallStartMarker);
      this.layer?.batchDraw();
      return;
    }
    // Second point : on ignore les segments minuscules (double-clic accidentel).
    if (Math.hypot(pos.x - this.wallStart.x, pos.y - this.wallStart.y) < 10) {
      return;
    }
    const width = stage.width();
    const height = stage.height();
    this.wallAdded.emit({
      x1: this.wallStart.x / width,
      y1: this.wallStart.y / height,
      x2: pos.x / width,
      y2: pos.y / height,
      // Epaisseur par defaut ~20 cm a l'echelle d'une salle de 10 m.
      thickness: 0.02,
    });
    this.resetWallDraft();
    // Enchaine : le prochain clic demarre un nouveau mur (trace en serie).
  }

  private updateWallPreview(): void {
    const pos = this.stage?.getPointerPosition();
    if (!pos || !this.wallStart || !this.wallPreview) {
      return;
    }
    this.wallPreview.points([this.wallStart.x, this.wallStart.y, pos.x, pos.y]);
    this.layer?.batchDraw();
  }

  private resetWallDraft(): void {
    this.wallStart = null;
    this.wallPreview?.destroy();
    this.wallPreview = null;
    this.wallStartMarker?.destroy();
    this.wallStartMarker = null;
    this.layer?.batchDraw();
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
    this.drawGrid();
    this.layout();
    // draw() synchrone (scene + hit) : batchDraw laissait le hit-canvas jamais
    // peint a l'initialisation (Konva 10) -> aucune table cliquable tant qu'une
    // mutation du modele ne declenchait pas d'autoDraw. Constate en E2E.
    this.layer?.draw();
  }

  private render(): void {
    if (!this.konva || !this.stage || !this.layer) {
      return;
    }
    this.drawGrid();
    this.syncNodes();
    this.layout();
    // Voir syncSize() : draw() synchrone pour garantir le hit-canvas.
    this.layer.draw();
  }

  // Trame de fond (reperes de magnetisme). Recreee au resize ; couche non interactive.
  private drawGrid(): void {
    const k = this.konva;
    const grid = this.gridLayer;
    const stage = this.stage;
    if (!k || !grid || !stage) {
      return;
    }
    grid.destroyChildren();
    const width = stage.width();
    const height = stage.height();
    const color = this.readVar(GRID_VAR, GRID_FALLBACK);
    const stepX = width * 0.05;
    const stepY = height * 0.05;
    for (let x = stepX; x < width; x += stepX) {
      grid.add(new k.Line({ points: [x, 0, x, height], stroke: color, strokeWidth: 1 }));
    }
    for (let y = stepY; y < height; y += stepY) {
      grid.add(new k.Line({ points: [0, y, width, y], stroke: color, strokeWidth: 1 }));
    }
    // Murs decoratifs (import Pascal) par-dessus la trame : la salle REELLE
    // apparait en fond, les tables restent seules interactives.
    const wallColor = this.readVar(NEUTRAL_STROKE_VAR, NEUTRAL_STROKE_FALLBACK);
    const minSide = Math.min(width, height);
    for (const w of this.walls()) {
      grid.add(
        new k.Line({
          points: [w.x1 * width, w.y1 * height, w.x2 * width, w.y2 * height],
          stroke: wallColor,
          strokeWidth: Math.max(3, w.thickness * minSide),
          lineCap: 'round',
          opacity: 0.9,
        }),
      );
    }
    grid.batchDraw();
  }

  private syncNodes(): void {
    const k = this.konva;
    const layer = this.layer;
    if (!k || !layer) {
      return;
    }
    const tables = this.tables();
    const seen = new Set<string>();
    const font = this.hostFontFamily();

    for (const t of tables) {
      seen.add(t.id);
      const isRound = t.shape === 'round';
      let node = this.nodes.get(t.id);
      if (!node || node.isRound !== isRound) {
        node?.group.destroy();
        node = this.createNode(t, isRound, font);
        this.nodes.set(t.id, node);
        layer.add(node.group);
      }
      this.updateNodeContent(node, t);
    }

    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.group.destroy();
        this.nodes.delete(id);
      }
    }
  }

  private createNode(table: EditorTable, isRound: boolean, font: string): EditorNode {
    const k = this.konva!;
    const group = new k.Group({ draggable: true, listening: true });
    const seats = new k.Group({ listening: false });
    const shape: Konva.Shape = isRound
      ? new k.Circle({ radius: 1 })
      : new k.Rect({ cornerRadius: 12 });
    applyTableShadow(shape);
    const label = new k.Text({
      text: table.label,
      fontSize: 13,
      fontStyle: 'bold',
      fontFamily: font,
      align: 'center',
      verticalAlign: 'middle',
      listening: false,
    });
    group.add(seats);
    group.add(shape);
    group.add(label);

    const id = table.id;

    // Selection au clic (Konva fournit l'event natif pour le multi-select clavier).
    group.on('click tap', (e) => {
      e.cancelBubble = true; // empeche le clic-vide du stage.
      const additive = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
      const current = new Set(this.selectedIds());
      if (additive) {
        if (current.has(id)) {
          current.delete(id);
        } else {
          current.add(id);
        }
        this.selectionChange.emit([...current]);
      } else {
        this.selectionChange.emit([id]);
      }
    });

    group.on('mouseenter', () => {
      const stage = this.stage;
      if (stage) {
        stage.container().style.cursor = 'move';
      }
    });
    group.on('mouseleave', () => {
      const stage = this.stage;
      if (stage) {
        stage.container().style.cursor = 'crosshair';
      }
    });

    // Drag : si la table draggee n'est pas selectionnee, on la selectionne d'abord.
    group.on('dragstart', () => {
      if (!this.selectedIds().includes(id)) {
        this.selectionChange.emit([id]);
      }
    });
    group.on('dragend', () => this.emitGeometryFromNodes());
    group.on('transformend', () => this.emitGeometryFromNodes());

    return { group, shape, seats, label, isRound };
  }

  private updateNodeContent(node: EditorNode, table: EditorTable): void {
    const fill = this.readVar(NEUTRAL_FILL_VAR, NEUTRAL_FILL_FALLBACK);
    const stroke = this.readVar(NEUTRAL_STROKE_VAR, NEUTRAL_STROKE_FALLBACK);
    node.shape.fill(fill);
    node.shape.stroke(stroke);
    node.shape.strokeWidth(1.5);
    // Sieges neutres : refletent les couverts pendant l'edition.
    syncSeatCount(this.konva!, node.seats, table.seats);
    styleSeats(node.seats, stroke, 0.7);
    node.label.text(table.label);
    node.label.fill(this.readVar(TEXT_VAR, TEXT_FALLBACK));
    node.group.rotation(table.rotation);
  }

  // Place et dimensionne les noeuds en pixels depuis le modele normalise.
  // ECHELLE UNIQUE (fix D2) : les tailles sont des fractions du PETIT COTE du
  // conteneur (w ET h) -> un carre reste carre sur tout ratio d'ecran. Seules les
  // positions x/y restent normalisees sur largeur/hauteur respectives.
  private layout(): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const width = stage.width();
    const height = stage.height();

    for (const t of this.tables()) {
      const node = this.nodes.get(t.id);
      if (!node) {
        continue;
      }
      const { w: wPx, h: hPx } = tableSizePx(t.width, t.height, width, height, MIN_SIZE_PX);
      node.group.position({ x: t.x * width, y: t.y * height });
      // On neutralise un eventuel scale residuel d'un transform precedent.
      node.group.scale({ x: 1, y: 1 });
      node.group.rotation(t.rotation);

      if (node.isRound) {
        const r = wPx / 2;
        (node.shape as Konva.Circle).radius(r);
        node.label.width(wPx);
        node.label.height(wPx);
        node.label.offset({ x: wPx / 2, y: wPx / 2 });
      } else {
        const rect = node.shape as Konva.Rect;
        rect.size({ width: wPx, height: hPx });
        rect.offset({ x: wPx / 2, y: hPx / 2 });
        node.label.width(wPx);
        node.label.height(hPx);
        node.label.offset({ x: wPx / 2, y: hPx / 2 });
      }
      // Sieges autour de la forme (comme la vue service).
      layoutSeats(node.seats, node.isRound, wPx, node.isRound ? wPx : hPx);
    }
  }

  // Attache le Transformer aux noeuds selectionnes (ou le detache si rien).
  private syncSelection(): void {
    const tr = this.transformer;
    const layer = this.layer;
    if (!tr || !layer) {
      return;
    }
    const ids = this.selectedIds();
    const groups = ids
      .map((id) => this.nodes.get(id)?.group)
      .filter((g): g is Konva.Group => g != null);
    tr.nodes(groups);
    layer.batchDraw();
  }

  // Lit la geometrie pixel des noeuds selectionnes -> modele normalise (avec snap),
  // et l'emet. Konva applique le resize via scale : on le « cuit » dans width/height
  // puis on remet scale a 1 pour garder un modele propre.
  private emitGeometryFromNodes(): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const width = stage.width();
    const height = stage.height();
    // Meme echelle unique que layout() : les tailles se reconvertissent par
    // rapport au petit cote du conteneur.
    const scale = Math.min(width, height);
    const doSnap = this.snap();
    const out: TableGeometry[] = [];

    for (const t of this.tables()) {
      const node = this.nodes.get(t.id);
      if (!node || !this.selectedIds().includes(t.id)) {
        continue;
      }
      const scaleX = node.group.scaleX();
      const scaleY = node.group.scaleY();

      // Dimensions « cuites » (px) : taille de base * scale du transform.
      const wPx = Math.max(MIN_SIZE_PX, t.width * scale * scaleX);
      const hPx = node.isRound ? wPx : Math.max(MIN_SIZE_PX, t.height * scale * scaleY);

      let nx = node.group.x() / width;
      let ny = node.group.y() / height;
      let nw = wPx / scale;
      let nh = hPx / scale;
      const rotation = Math.round(node.group.rotation());

      if (doSnap) {
        nx = snapToGrid(nx);
        ny = snapToGrid(ny);
        nw = Math.max(MIN_SIZE_PX / scale, snapToGrid(nw));
        nh = Math.max(MIN_SIZE_PX / scale, snapToGrid(nh));
      }

      out.push({
        id: t.id,
        x: clamp(nx, 0, 1),
        y: clamp(ny, 0, 1),
        width: clamp(nw, 0, 1),
        height: node.isRound ? clamp(nw, 0, 1) : clamp(nh, 0, 1),
        rotation,
      });

      // Remet le noeud dans un etat « scale 1 » coherent avec le modele a venir.
      node.group.scale({ x: 1, y: 1 });
    }

    if (out.length > 0) {
      this.geometryChange.emit(out);
    }
  }

  // EXPORT PNG (LOT B4) : capture du plan (pixelRatio 2 = net en retina).
  // null tant que le stage Konva n'est pas monte (import dynamique en cours).
  exportPng(): string | null {
    return this.stage?.toDataURL({ pixelRatio: 2 }) ?? null;
  }

  private hostFontFamily(): string {
    const el = this.hostEl.nativeElement;
    const view = el.ownerDocument?.defaultView;
    const family = view?.getComputedStyle(el).fontFamily?.trim();
    return family || 'sans-serif';
  }

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
