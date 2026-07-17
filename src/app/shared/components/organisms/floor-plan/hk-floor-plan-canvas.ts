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
import { FloorTableStatus, FloorTableView, tableTimeLabel } from '@core/models/floor-plan.model';
import { WallSegment, tableSizePx } from '@core/models/floor-plan-editor.model';
import {
  applyTableShadow,
  hoverTableShadow,
  layoutPlates,
  layoutSeats,
  styleSeats,
  syncSeatCount,
} from './konva-table-style';

// Type du namespace Konva (import dynamique a l'execution pour ne pas alourdir
// le bundle initial : Konva n'est charge qu'a l'ouverture de la vue Plan).
type KonvaModule = typeof Konva;

// Couleurs de statut pour le canvas (Konva = imperatif, pas de classes CSS).
// On lit les tokens OKLCH du design system depuis le conteneur, avec repli.
// Semantique ALIGNEE sur les badges de la vue Liste (intuitif + coherent) :
//  - libre     : blanc, contour discret (rien a signaler) ;
//  - reservee  : VERT st-confirmed (creneau confirme, comme le badge « Confirmée ») ;
//  - installee : BLEU st-seated (des clients sont a table, comme le badge « Installée »).
interface StatusColors {
  fill: string;
  stroke: string;
  text: string;
}

const COLOR_VARS: Record<FloorTableStatus, { fill: string; stroke: string; text: string }> = {
  libre: {
    fill: '--surface',
    stroke: '--border-strong',
    text: '--st-completed-fg',
  },
  reservee: {
    fill: '--st-confirmed-bg',
    stroke: '--st-confirmed-fg',
    text: '--st-confirmed-fg',
  },
  installee: {
    fill: '--st-seated-bg',
    stroke: '--st-seated-fg',
    text: '--st-seated-fg',
  },
};

const FALLBACK_COLORS: Record<FloorTableStatus, StatusColors> = {
  libre: { fill: '#ffffff', stroke: '#d6d6d2', text: '#8a8a84' },
  reservee: { fill: '#e8f4ee', stroke: '#37795d', text: '#37795d' },
  installee: { fill: '#e9eef9', stroke: '#54719f', text: '#54719f' },
};

const ACCENT_VAR = '--green-600';
const ACCENT_FALLBACK = '#2f9e6f';
// Pastille d'heure en RETARD (reservee, +15 min sans installation) : couleur danger.
const DANGER_VAR = '--st-cancelled-fg';
const DANGER_FALLBACK = '#a33d2e';
// « → 21:00 » sous une table libre reservee plus tard : texte discret (muted).
const MUTED_VAR = '--text-muted';
const MUTED_FALLBACK = '#8a8a84';
// Nom de table : toujours sombre et lisible (le statut est porte par l'anneau,
// les sieges et la pastille d'heure, pas par la couleur du nom).
const NAME_VAR = '--text';
const NAME_FALLBACK = '#26251f';
// Nom du client (mode service) : ton discret sous le nom de table.
const CUSTOMER_VAR = '--text-muted';
const CUSTOMER_FALLBACK = '#8a8a84';

// BAR : teinte BOIS quand il est libre (meme famille que le comptoir 3D et les
// apercus de templates) — un bar ne ressemble pas a une table blanche. Occupee,
// la couleur de STATUT reprend le dessus (l'information de service prime).
const BAR_FILL = '#ead9c0';
const BAR_STROKE = '#c9a476';

// MODE SERVICE : au-dela de ce seuil de largeur (px), le conteneur est « grand »
// (ecran mural) -> on grossit legerement les textes pour rester lisibles de loin.
const BIG_CONTAINER_PX = 1000;
const BIG_FONT_BUMP = 2;
// Longueur max du nom client affiche sur une table (au-dela : troncature « … »).
const CUSTOMER_MAX_CHARS = 14;

function truncateName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > CUSTOMER_MAX_CHARS
    ? `${trimmed.slice(0, CUSTOMER_MAX_CHARS - 1)}…`
    : trimmed;
}

// Noeud Konva persistant pour une table : on cree le groupe + ses enfants UNE FOIS,
// puis on les met a jour (layout + contenu) au lieu de tout detruire chaque frame.
interface TableNode {
  group: Konva.Group;
  shape: Konva.Shape; // Circle (rond) ou Rect (autres).
  // Sieges dessines autour de la table (derriere la forme).
  seats: Konva.Group;
  name: Konva.Text;
  capacity: Konva.Text;
  // Nom du client (mode service, table occupee) : petit texte sous le nom de table.
  // Toujours cree ; vide (invisible) hors mode service ou table libre.
  customer: Konva.Text;
  // Heure de la reservation (LOT B5) : pastille posee sur le bord bas de la table.
  timeTag: Konva.Label;
  // Prochaine reservation d'une table LIBRE (« → 21:00 ») : texte discret sous
  // la capacite (info de decision de l'hote).
  nextTime: Konva.Text;
  // Assiettes posees sur le plateau d'une table INSTALLEE (salle vivante).
  plates: Konva.Group;
  isRound: boolean;
}

// Canvas Konva du plan de salle (Phase 1, lecture seule + clic).
//
// REFACTOR (prerequis Phase 2) : noeuds Konva PERSISTANTS.
// Auparavant draw() faisait layer.destroyChildren() puis recreait tout a chaque
// frame — incompatible avec le drag/resize a venir. Desormais :
//  - syncNodes()  : reconcilie la liste de tables avec une Map<id, TableNode>
//                   (cree les nouveaux, supprime les disparus) — le « contenu » ;
//  - layout()     : (re)positionne/dimensionne les noeuds en pixels — appele aussi
//                   au resize (coords stockees normalisees 0..1).
// Le mode service (lecture seule) reste identique cote API (inputs/outputs).
@Component({
  selector: 'hk-floor-plan-canvas',
  template: `
    <div
      #host
      role="img"
      aria-label="Plan de salle (vue visuelle ; utilisez la vue Liste pour le detail accessible)"
      class="border-border relative w-full overflow-hidden rounded-lg border"
      style="background: #faf7f1"
      [class.h-full]="fill()"
      [style.aspect-ratio]="fill() ? null : '16 / 10'"
      [style.min-height.px]="fill() ? 0 : 320"
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
  // MEILLEUR FIT (LOT B2) : id de la table recommandee -> surlignage RENFORCE
  // (trait plein, plus epais). Calcule par hk-floor-plan (bestFitTableId).
  readonly bestTableId = input<string | null>(null);
  // Couverts de la reservation en cours d'affectation : les tables libres TROP
  // PETITES ne sont PAS surlignees (decision B2 : elles restent cliquables — le
  // garde-fou B1 intercepte — mais sans halo, pour ne pas suggerer un mauvais choix).
  readonly requiredSeats = input<number | null>(null);
  // MODE SERVICE : le host remplit son conteneur (h-full, pas d'aspect-ratio 16/10)
  // pour occuper tout l'ecran mural au lieu d'un petit carre.
  readonly fill = input(false);
  // MODE SERVICE : affiche le nom du client sur chaque table occupee (lisibilite
  // « poste d'accueil »). Vide hors mode service ou table libre.
  readonly showNames = input(false);
  // Murs decoratifs (import Pascal) : dessines dans la couche de fond.
  readonly walls = input<WallSegment[]>([]);
  // FOCUS : id de la table dont le detail est OUVERT (drawer / walk-in). Les
  // autres tables s'attenuent -> on voit immediatement « je suis sur celle-ci ».
  readonly focusTableId = input<string | null>(null);

  readonly tableClick = output<FloorTableView>();

  private konva: KonvaModule | null = null;
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  // Trame de points en fond (purement decorative, non interactive).
  private dotsLayer: Konva.Layer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeRaf = 0;

  // Pastilles d'heure EN RETARD : elles pulsent (opacite) via une seule
  // Konva.Animation partagee, demarree/arretee selon la presence de retards.
  private lateTags: Konva.Label[] = [];
  private lateAnim: Konva.Animation | null = null;

  // Noeuds persistants indexes par id de table + derniere vue connue (pour le clic).
  private readonly nodes = new Map<string, TableNode>();
  private viewsById = new Map<string, FloorTableView>();

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(async () => {
      try {
        // Import dynamique : Konva n'entre pas dans le bundle initial.
        const mod = await import('konva');
        this.konva = mod.default;
        const container = this.host().nativeElement;
        this.stage = new this.konva.Stage({
          container,
          width: container.clientWidth || 1,
          height: container.clientHeight || 1,
        });
        this.dotsLayer = new this.konva.Layer({ listening: false });
        this.layer = new this.konva.Layer();
        this.stage.add(this.dotsLayer);
        this.stage.add(this.layer);
        this.drawDots();

        // Debounce via rAF : le ResizeObserver peut tirer en rafale pendant un
        // redimensionnement de fenetre ; on ne resynchronise qu'une fois par frame.
        this.resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(this.resizeRaf);
          this.resizeRaf = requestAnimationFrame(() => this.syncSize());
        });
        this.resizeObserver.observe(container);
        this.render();
      } catch {
        // Environnement sans <canvas> reel (jsdom en test) : le canvas Konva ne peut
        // pas s'initialiser. On degrade sans casser (le host + ses classes restent).
        this.konva = null;
      }
    });

    // Redessine quand les inputs changent (lecture de signals = fonctionne sans zone).
    effect(() => {
      // Dependances : tables + surlignage + meilleur fit.
      this.tables();
      this.highlightFree();
      this.bestTableId();
      this.requiredSeats();
      this.showNames();
      this.fill();
      this.walls();
      this.focusTableId();
      this.drawDots();
      this.render();
    });

    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeObserver?.disconnect();
      this.stopPulse();
      this.lateAnim?.stop();
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
    // Resize = layout seul (le contenu n'a pas change), bien plus leger.
    this.drawDots();
    this.layout();
    // draw() synchrone (scene + hit) : batchDraw laissait le hit-canvas jamais
    // peint a l'initialisation (Konva 10) -> tables non cliquables tant qu'une
    // mutation (ex. refresh du polling) ne declenchait pas d'autoDraw.
    this.layer?.draw();
  }

  // Trame de points discrete en fond (repere spatial, aspect « outil de plan »).
  private drawDots(): void {
    const k = this.konva;
    const layer = this.dotsLayer;
    const stage = this.stage;
    if (!k || !layer || !stage) {
      return;
    }
    layer.destroyChildren();
    const color = this.readVar('--border-strong', '#d6d6d2');
    const step = 26;
    for (let x = step; x < stage.width(); x += step) {
      for (let y = step; y < stage.height(); y += step) {
        layer.add(new k.Circle({ x, y, radius: 1, fill: color, opacity: 0.45 }));
      }
    }
    // Murs decoratifs (import Pascal) : la salle reelle en fond, non interactive.
    const width = stage.width();
    const height = stage.height();
    const minSide = Math.min(width, height);
    for (const w of this.walls()) {
      layer.add(
        new k.Line({
          points: [w.x1 * width, w.y1 * height, w.x2 * width, w.y2 * height],
          stroke: color,
          strokeWidth: Math.max(3, w.thickness * minSide),
          lineCap: 'round',
          opacity: 0.8,
        }),
      );
    }
    layer.batchDraw();
  }

  // Pipeline complet : reconcilie les noeuds (contenu) puis les positionne (layout).
  private render(): void {
    if (!this.konva || !this.stage || !this.layer) {
      return;
    }
    this.syncNodes();
    this.layout();
    // Voir syncSize() : draw() synchrone pour garantir le hit-canvas.
    this.layer.draw();
  }

  // Reconcilie la Map de noeuds avec la liste de tables : cree les manquants,
  // met a jour le contenu (couleurs/texte/surlignage), supprime les disparus.
  private syncNodes(): void {
    const k = this.konva;
    const layer = this.layer;
    if (!k || !layer) {
      return;
    }
    const tables = this.tables();
    const highlight = this.highlightFree();
    const bestId = this.bestTableId();
    const required = this.requiredSeats();
    const font = this.hostFontFamily();

    this.viewsById = new Map(tables.map((v) => [v.table.id, v]));
    const seen = new Set<string>();
    const lateTags: Konva.Label[] = [];

    for (const view of tables) {
      seen.add(view.table.id);
      // Forme issue du plan edite (bridge LOT A) : rond = Circle, le reste = Rect.
      const isRound = view.shape === 'round';
      let node = this.nodes.get(view.table.id);

      // Recree le noeud si absent OU si la forme a change (rond <-> rect).
      if (!node || node.isRound !== isRound) {
        node?.group.destroy();
        node = this.createNode(view, isRound, font);
        this.nodes.set(view.table.id, node);
        layer.add(node.group);
      }

      this.updateNodeContent(node, view, highlight, bestId, required);
      // FOCUS : detail ouvert sur UNE table -> les autres s'attenuent, celle-ci
      // reste pleinement allumee (« je suis sur cette table »).
      const focusId = this.focusTableId();
      node.group.opacity(focusId === null || view.table.id === focusId ? 1 : 0.35);
      if (view.status === 'reservee' && view.lateMinutes !== null) {
        lateTags.push(node.timeTag);
      }
    }

    // Supprime les noeuds dont la table n'existe plus.
    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.group.destroy();
        this.nodes.delete(id);
      }
    }

    this.lateTags = lateTags;
    this.syncLateAnim();
  }

  // Demarre/arrete l'animation de pulse des pastilles EN RETARD (une seule
  // Konva.Animation pour toutes : opacite sinusoidale douce, signal d'urgence).
  private syncLateAnim(): void {
    const k = this.konva;
    if (!k || !this.layer) {
      return;
    }
    if (this.lateTags.length === 0) {
      this.lateAnim?.stop();
      this.lateAnim = null;
      return;
    }
    if (this.lateAnim) {
      return; // deja en route, elle lit this.lateTags a chaque frame.
    }
    this.lateAnim = new k.Animation((frame) => {
      const opacity = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin((frame?.time ?? 0) / 180));
      for (const tag of this.lateTags) {
        tag.opacity(opacity);
      }
    }, this.layer);
    this.lateAnim.start();
  }

  // Cree un noeud Konva (sieges + forme ombree + textes + pastille d'heure)
  // et branche ses interactions.
  private createNode(view: FloorTableView, isRound: boolean, font: string): TableNode {
    const k = this.konva!;
    const group = new k.Group({ listening: true });

    // Sieges DERRIERE la forme (les chaises depassent du plateau).
    const seats = new k.Group({ listening: false });
    // Assiettes AU-DESSUS du plateau (visibles seulement si la table est installee).
    const plates = new k.Group({ listening: false, visible: false });

    const shape: Konva.Shape = isRound
      ? new k.Circle({ radius: 1 })
      : new k.Rect({ cornerRadius: 12 });
    applyTableShadow(shape);

    const name = new k.Text({
      text: view.table.name,
      fontSize: 15,
      fontStyle: 'bold',
      fontFamily: font,
      align: 'center',
      listening: false,
    });
    const capacity = new k.Text({
      text: `${view.table.capacity} couv.`,
      fontSize: 10.5,
      fontFamily: font,
      align: 'center',
      listening: false,
    });
    const customer = new k.Text({
      text: '',
      fontSize: 11,
      fontStyle: 'bold',
      fontFamily: font,
      align: 'center',
      listening: false,
      visible: false,
    });
    const nextTime = new k.Text({
      text: '',
      fontSize: 10,
      fontFamily: font,
      align: 'center',
      listening: false,
      visible: false,
    });
    // Pastille d'heure : posee a cheval sur le bord bas de la table (badge).
    const timeTag = new k.Label({ listening: false, visible: false });
    timeTag.add(new k.Tag({ cornerRadius: 9 }));
    timeTag.add(
      new k.Text({
        text: '',
        fontSize: 10,
        fontStyle: 'bold',
        fontFamily: font,
        fill: '#ffffff',
        padding: 4,
      }),
    );

    group.add(seats);
    group.add(shape);
    group.add(plates);
    group.add(name);
    group.add(capacity);
    group.add(customer);
    group.add(nextTime);
    group.add(timeTag);

    const id = view.table.id;
    group.on('click tap', () => {
      const current = this.viewsById.get(id);
      if (current) {
        this.tableClick.emit(current);
      }
    });
    group.on('mouseenter', () => {
      const stage = this.stage;
      if (stage) {
        stage.container().style.cursor = 'pointer';
      }
      hoverTableShadow(shape, true);
      this.layer?.batchDraw();
    });
    group.on('mouseleave', () => {
      const stage = this.stage;
      if (stage) {
        stage.container().style.cursor = 'default';
      }
      hoverTableShadow(shape, false);
      this.layer?.batchDraw();
    });

    return { group, shape, seats, plates, name, capacity, customer, timeTag, nextTime, isRound };
  }

  // Met a jour le CONTENU d'un noeud (couleurs, texte, surlignage). Pas de geometrie
  // ici : la taille/position pixel est calculee dans layout() (depend du conteneur).
  // Surlignage a 3 niveaux pendant l'affectation (LOT B2) :
  //  - table recommandee (bestId)      : trait PLEIN epais accent — rendu MEME
  //    sans selection (survol d'une resa non placee : la salle repond deja) ;
  //  - libre de capacite suffisante    : trait pointille accent (selection seule) ;
  //  - libre trop petite               : AUCUN surlignage (mais reste cliquable, B1).
  private updateNodeContent(
    node: TableNode,
    view: FloorTableView,
    highlight: boolean,
    bestId: string | null,
    required: number | null,
  ): void {
    const colors = this.colorsFor(view.status);
    const fits = required == null || view.table.capacity >= required;
    const showHint = highlight && view.status === 'libre' && fits;
    const isBest = view.status === 'libre' && view.table.id === bestId && fits;
    const barIdle = view.shape === 'bar' && view.status === 'libre';
    const stroke = showHint || isBest ? this.accentColor() : barIdle ? BAR_STROKE : colors.stroke;
    const strokeWidth = isBest ? 4 : showHint ? 3 : view.status === 'libre' ? 1.5 : 2;
    const dash = showHint && !isBest ? [6, 4] : [];

    node.shape.fill(barIdle ? BAR_FILL : colors.fill);
    node.shape.stroke(stroke);
    node.shape.strokeWidth(strokeWidth);
    node.shape.dash(dash);

    // Sieges : autant que de couverts, colores selon le statut.
    const k = this.konva!;
    syncSeatCount(k, node.seats, view.table.capacity);
    styleSeats(node.seats, view.status === 'libre' ? colors.stroke : colors.stroke, 0.55);

    // Assiettes uniquement quand des clients sont A TABLE (positions au layout).
    node.plates.visible(view.status === 'installee');

    // Nom toujours sombre (lisibilite) ; capacite en couleur de statut discrete.
    node.name.text(view.table.name);
    node.name.fill(this.readVar(NAME_VAR, NAME_FALLBACK));
    node.capacity.text(`${view.table.capacity} couv.`);
    node.capacity.fill(colors.text);

    // MODE SERVICE : nom du client sous le nom de table (tables occupees seulement).
    // Hors mode service ou table libre -> texte vide/masque (rendu normal preserve).
    const customerName =
      this.showNames() && view.status !== 'libre' && view.reservation
        ? truncateName(view.reservation.customerName)
        : '';
    node.customer.text(customerName);
    node.customer.fill(this.readVar(CUSTOMER_VAR, CUSTOMER_FALLBACK));
    node.customer.visible(!!customerName);

    // Pastille d'heure (LOT B5) : masquee pour une table libre.
    // ALERTE RETARD : reservee depassee de +15 min sans installation -> la pastille
    // passe en couleur DANGER (le label porte deja « 20:00 · +25 min »).
    const label = tableTimeLabel(view);
    const isLate = view.status === 'reservee' && view.lateMinutes !== null;
    const tagText = node.timeTag.getText() as Konva.Text;
    const tag = node.timeTag.getTag() as Konva.Tag;
    tagText.text(label);
    tag.fill(isLate ? this.readVar(DANGER_VAR, DANGER_FALLBACK) : colors.stroke);
    node.timeTag.visible(!!label);
    // Une pastille qui n'est plus en retard reprend son opacite pleine (le pulse
    // n'anime que les pastilles listees dans lateTags).
    if (!isLate) {
      node.timeTag.opacity(1);
    }

    // Table LIBRE reservee plus tard : « → 21:00 » discret sous « N couv. ».
    const next = view.status === 'libre' && view.nextTime ? `→ ${view.nextTime}` : '';
    node.nextTime.text(next);
    node.nextTime.fill(this.readVar(MUTED_VAR, MUTED_FALLBACK));
    node.nextTime.visible(!!next);
  }

  // Positionne et dimensionne tous les noeuds en pixels (depuis coords 0..1).
  // Appele au render ET au resize (le contenu ne change pas, seule la geometrie).
  // ECHELLE UNIQUE (fix D2) : w/h sont des fractions du PETIT COTE du conteneur,
  // comme dans l'editeur -> le plan edite s'affiche a l'identique en vue service
  // (taille, forme ET rotation).
  private layout(): void {
    if (!this.stage) {
      return;
    }
    const width = this.stage.width();
    const height = this.stage.height();
    // Ecran mural : textes legerement grossis pour rester lisibles de loin.
    const bump = width > BIG_CONTAINER_PX ? BIG_FONT_BUMP : 0;

    for (const view of this.tables()) {
      const node = this.nodes.get(view.table.id);
      if (!node) {
        continue;
      }
      const { w: wPx, h: hPx } = tableSizePx(view.w, view.h, width, height);
      node.group.position({ x: view.x * width, y: view.y * height });
      node.group.rotation(view.rotation);

      if (node.isRound) {
        (node.shape as Konva.Circle).radius(wPx / 2);
      } else {
        const rect = node.shape as Konva.Rect;
        rect.size({ width: wPx, height: hPx });
        rect.offset({ x: wPx / 2, y: hPx / 2 });
      }

      // Sieges autour de la forme (rond = hPx sans objet, on passe wPx).
      layoutSeats(node.seats, node.isRound, wPx, node.isRound ? wPx : hPx);
      // Assiettes devant chaque chaise (table installee uniquement).
      if (node.plates.visible() && this.konva) {
        layoutPlates(this.konva, node.plates, node.seats);
      }

      node.name.fontSize(15 + bump);
      node.name.width(wPx);
      node.name.offset({ x: wPx / 2, y: 13 + bump });
      node.capacity.fontSize(10.5 + bump);
      node.capacity.width(wPx);
      node.capacity.offset({ x: wPx / 2, y: -3 });
      // Nom du client (mode service) et « → 21:00 » (table libre) partagent la meme
      // ligne sous la capacite : ils ne coexistent jamais (occupee vs libre).
      node.customer.fontSize(11 + bump);
      node.customer.width(wPx);
      node.customer.offset({ x: wPx / 2, y: -16 });
      // « → 21:00 » juste sous la ligne de capacite.
      node.nextTime.fontSize(10 + bump);
      node.nextTime.width(wPx);
      node.nextTime.offset({ x: wPx / 2, y: -16 });

      // Pastille d'heure a cheval sur le bord bas (style badge).
      const edgeY = (node.isRound ? wPx : hPx) / 2;
      node.timeTag.position({
        x: -node.timeTag.width() / 2,
        y: edgeY - node.timeTag.height() / 2,
      });
    }
  }

  // --- Export PNG (LOT B4) -----------------------------------------------------

  // Capture du plan en PNG (pixelRatio 2 = net sur ecrans retina / impression).
  // null tant que le stage Konva n'est pas monte (import dynamique en cours).
  exportPng(): string | null {
    return this.stage?.toDataURL({ pixelRatio: 2 }) ?? null;
  }

  // --- Pulse (LOT B3) ------------------------------------------------------------

  // Animation en cours (une seule a la fois ; nettoyee au destroy et entre 2 pulses).
  private pulseTween: Konva.Tween | null = null;
  private pulsedGroup: Konva.Group | null = null;

  // Pulse DOUX d'une table (nouvelle reservation placee, detectee par le polling) :
  // scale 1 -> 1.08 -> 1, deux cycles (~1 s au total), via Konva.Tween chaines.
  pulseTable(id: string): void {
    const k = this.konva;
    const node = this.nodes.get(id);
    if (!k || !node) {
      return;
    }
    this.stopPulse();
    const group = node.group;
    this.pulsedGroup = group;
    let cycle = 0;

    const grow = (): void => {
      // Le noeud a pu etre detruit pendant l'animation (table supprimee par un
      // refresh) : un groupe sans stage ne doit plus etre anime.
      if (!group.getStage()) {
        this.pulseTween = null;
        this.pulsedGroup = null;
        return;
      }
      this.pulseTween = new k.Tween({
        node: group,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 0.25,
        easing: k.Easings.EaseInOut,
        onFinish: shrink,
      });
      this.pulseTween.play();
    };
    const shrink = (): void => {
      if (!group.getStage()) {
        this.pulseTween = null;
        this.pulsedGroup = null;
        return;
      }
      this.pulseTween = new k.Tween({
        node: group,
        scaleX: 1,
        scaleY: 1,
        duration: 0.25,
        easing: k.Easings.EaseInOut,
        onFinish: () => {
          cycle += 1;
          if (cycle < 2) {
            grow();
          } else {
            this.pulseTween = null;
            this.pulsedGroup = null;
          }
        },
      });
      this.pulseTween.play();
    };
    grow();
  }

  // Interrompt proprement le pulse en cours et remet la table a l'echelle 1.
  private stopPulse(): void {
    this.pulseTween?.destroy();
    this.pulseTween = null;
    this.pulsedGroup?.scale({ x: 1, y: 1 });
    this.pulsedGroup = null;
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

  // Police du conteneur : Konva n'herite pas du CSS, on lit la vraie famille.
  private hostFontFamily(): string {
    const el = this.hostEl.nativeElement;
    const view = el.ownerDocument?.defaultView;
    const family = view?.getComputedStyle(el).fontFamily?.trim();
    return family || 'sans-serif';
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
