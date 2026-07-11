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
import type * as THREE from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js';
import { FloorTableView } from '@core/models/floor-plan.model';
import { TableShape, WallSegment } from '@core/models/floor-plan-editor.model';
import { formatTime } from '@core/utils/format';

type ThreeModule = typeof THREE;

// Monde 3D : la salle est projetee sur un sol de 16 x 10 unites (meme ratio que
// les canvas 2D). x normalise -> X * 16, y normalise -> Z * 10 ; les tailles
// (fractions du petit cote) -> * 10. Hauteurs choisies pour la lisibilite.
const WORLD_W = 16;
const WORLD_D = 10;
const WALL_HEIGHT = 1.15;
// Anatomie d'une table : plateau a hauteur reelle ~0.42 (proportion credible).
const TABLE_TOP_Y = 0.42;
const TABLE_TOP_THICKNESS = 0.06;

// CAMERA : on demarre EXACTEMENT comme la vue 2D (aplomb, meme orientation),
// puis on descend doucement vers une perspective legere -> l'utilisateur
// comprend la 3D sans jamais perdre ses reperes. Pas de rotation automatique.
// Un double-clic ramene toujours a la vue de reference (anti « je suis perdu »).
const CAMERA_FROM = { x: 0, y: 15.5, z: 0.9 };
const CAMERA_TO = { x: 0, y: 9.5, z: 8.4 };
const CAMERA_INTRO_MS = 1700;
const CAMERA_RESET_MS = 750;

// Palette « restaurant » : sol chaud, murs sable, bois pour les tables libres,
// nappe verte (reservee) / bleue (installee) / rouge (retard) — memes codes
// couleur que la legende 2D.
const COLOR_FLOOR = 0xf3efe7;
const COLOR_WALL = 0xd6cfc4;
const COLOR_WOOD = 0xd4b28c;
const COLOR_LEG = 0x7d6a55;
const COLOR_CHAIR = 0xcfc8bc;
const COLOR_RESERVED = 0x30a46c;
const COLOR_SEATED = 0x3d7fd9;
const COLOR_LATE = 0xd64545;
const COLOR_PLATE = 0xfdfcfa;

// Couleurs CSS des sous-titres d'etiquette (canvas 2D).
const LABEL_LATE = '#d64545';
const LABEL_SEATED = '#3d7fd9';
const LABEL_RESERVED = '#30a46c';
const LABEL_MUTED = '#8a8378';

// Seuil de « clic » : au-dela de ce deplacement (px), le geste est une rotation
// de camera (OrbitControls), pas une selection de table.
const CLICK_MOVE_PX = 6;
// Chaises dessinees au maximum par table (au-dela : illisible, pas utile).
const MAX_CHAIRS = 16;

// Emplacement d'une chaise autour d'une table (repere LOCAL de la table).
interface ChairSlot {
  x: number;
  z: number;
  // Rotation Y du groupe chaise pour que le dossier tourne le dos a la table.
  rotationY: number;
}

// Repartit `count` chaises autour d'une table (comme les sieges de la vue 2D).
// Ronde : cercle regulier. Rect/carre : par cote, proportionnel a sa longueur.
// Bar : un seul cote assis.
export function chairSlots(shape: TableShape, wU: number, dU: number, count: number): ChairSlot[] {
  const n = Math.min(count, MAX_CHAIRS);
  const gap = 0.32;
  const slots: ChairSlot[] = [];
  if (n <= 0) {
    return slots;
  }

  if (shape === 'round') {
    const r = wU / 2 + gap;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // Dossier vers l'exterieur : +Z local de la chaise pointe (cos a, sin a).
      slots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rotationY: Math.PI / 2 - a });
    }
    return slots;
  }

  // Chaises alignees sur un cote : k places reparties sur la longueur utile.
  const alongSide = (k: number, length: number, fixed: number, side: 'n' | 's' | 'e' | 'w') => {
    for (let i = 0; i < k; i++) {
      const offset = (((i + 0.5) / k) * 0.9 - 0.45) * length;
      if (side === 'n') {
        slots.push({ x: offset, z: -fixed, rotationY: Math.PI });
      } else if (side === 's') {
        slots.push({ x: offset, z: fixed, rotationY: 0 });
      } else if (side === 'w') {
        slots.push({ x: -fixed, z: offset, rotationY: -Math.PI / 2 });
      } else {
        slots.push({ x: fixed, z: offset, rotationY: Math.PI / 2 });
      }
    }
  };

  if (shape === 'bar') {
    // Comptoir : tabourets sur le cote long « public » uniquement.
    alongSide(n, Math.max(wU, dU), Math.min(wU, dU) / 2 + gap, wU >= dU ? 's' : 'e');
    return slots;
  }

  // Rect / carre : cotes longs d'abord, le reste sur les cotes courts.
  const perimeter = 2 * (wU + dU);
  const top = Math.round((n * wU) / perimeter);
  const bottom = Math.min(n - top, Math.round((n * wU) / perimeter));
  const rest = n - top - bottom;
  const right = Math.ceil(rest / 2);
  const left = rest - right;
  alongSide(top, wU, dU / 2 + gap, 'n');
  alongSide(bottom, wU, dU / 2 + gap, 's');
  alongSide(right, dU, wU / 2 + gap, 'e');
  alongSide(left, dU, wU / 2 + gap, 'w');
  return slots;
}

// Contenu d'une etiquette de table : titre + sous-titre contextuel. Fonction
// PURE (testable sans WebGL) : c'est l'info de decision de l'hote, comme en 2D.
//  - retard      : « Marc · +25 min » (rouge) ;
//  - installee   : « Marc · 19:30 » (bleu) ;
//  - reservee    : « Marc · 19:30 » (vert) ;
//  - libre avec resa plus tard : « → 21:00 » (gris) ;
//  - libre sans rien : pas de sous-titre.
export function tableLabelParts(v: FloorTableView): {
  title: string;
  subtitle: string | null;
  color: string;
} {
  const title = v.table.name;
  const customer = v.reservation?.customerName ?? 'Client';
  const time = v.reservation ? formatTime(v.reservation.dateTime) : null;

  if (v.lateMinutes != null) {
    return { title, subtitle: `${customer} · +${v.lateMinutes} min`, color: LABEL_LATE };
  }
  if (v.status === 'installee') {
    return {
      title,
      subtitle: time ? `${customer} · ${time}` : customer,
      color: LABEL_SEATED,
    };
  }
  if (v.status === 'reservee') {
    return {
      title,
      subtitle: time ? `${customer} · ${time}` : customer,
      color: LABEL_RESERVED,
    };
  }
  if (v.nextTime) {
    return { title, subtitle: `→ ${v.nextTime}`, color: LABEL_MUTED };
  }
  return { title, subtitle: null, color: LABEL_MUTED };
}

// Vue 3D INTERACTIVE de la salle, generee depuis NOS donnees (murs importes +
// tables + statuts derives). Toujours synchronisee avec le service en cours
// (polling -> statuts -> couleurs de nappe), et cliquable comme la 2D : une
// table emise au clic declenche les memes actions (drawer, walk-in, affectation).
//
// Three.js est charge dynamiquement (comme Konva) : hors du bundle initial, et
// degrade proprement en environnement sans WebGL (jsdom en test).
@Component({
  selector: 'hk-floor-plan-3d',
  template: `
    <div
      #host
      role="application"
      aria-label="Vue 3D de la salle. Cliquez une table pour agir, glissez pour tourner la caméra."
      class="bg-surface-2 border-border relative w-full overflow-hidden rounded-md border"
      [class.h-full]="fill()"
      [style.aspect-ratio]="fill() ? null : '16 / 10'"
      [style.min-height.px]="fill() ? 0 : 320"
    ></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFloorPlan3d {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  // Tables placees + statut derive (memes vues que le canvas 2D).
  readonly views = input<FloorTableView[]>([]);
  // Murs decoratifs (import Pascal).
  readonly walls = input<WallSegment[]>([]);
  // MODE SERVICE : remplit le conteneur (h-full) au lieu du ratio 16/10.
  readonly fill = input(false);

  // Clic sur une table : memes actions que la 2D (drawer / walk-in / affectation).
  readonly tableClick = output<FloorTableView>();

  private three: ThreeModule | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControlsType | null = null;
  // Groupe reconstruit a chaque changement de donnees (petits volumes : simple et sur).
  private roomGroup: THREE.Group | null = null;
  private rafId = 0;
  private resizeObserver: ResizeObserver | null = null;

  // Animation camera en cours (intro 2D -> perspective, ou recentrage double-clic).
  private cameraAnim: {
    from: { x: number; y: number; z: number };
    to: { x: number; y: number; z: number };
    startedAt: number;
    duration: number;
  } | null = null;

  // Nappes en retard : pulsent en rouge (meme signal d'urgence que le pulse 2D).
  private lateMeshes: THREE.Mesh[] = [];

  // Interaction : plateaux cliquables + vue associee (par uuid de mesh).
  private tableMeshes: THREE.Mesh[] = [];
  private viewByUuid = new Map<string, FloorTableView>();
  private raycaster: THREE.Raycaster | null = null;
  private hovered: THREE.Mesh | null = null;
  private pointerDownAt: { x: number; y: number } | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(async () => {
      try {
        const [mod, controlsMod] = await Promise.all([
          import('three'),
          import('three/examples/jsm/controls/OrbitControls.js'),
        ]);
        this.three = mod;
        this.initScene(controlsMod.OrbitControls);
        this.buildRoom();
        this.animate();
      } catch {
        // Pas de WebGL (jsdom / navigateur tres ancien) : on degrade sans casser.
        this.three = null;
      }
    });

    // Reconstruit la salle quand les donnees changent (statuts live compris).
    effect(() => {
      this.views();
      this.walls();
      this.buildRoom();
    });

    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.rafId);
      this.resizeObserver?.disconnect();
      this.controls?.dispose();
      this.renderer?.dispose();
    });
  }

  private initScene(OrbitControls: typeof OrbitControlsType): void {
    const t = this.three!;
    const container = this.host().nativeElement;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    this.renderer = new t.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    // Ombres douces : c'est ce qui donne le relief (fini le « gris sur gris »).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = t.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cursor = 'grab';

    this.scene = new t.Scene();

    this.camera = new t.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(CAMERA_FROM.x, CAMERA_FROM.y, CAMERA_FROM.z);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15; // jamais sous le sol.
    this.controls.minDistance = 5;
    this.controls.maxDistance = 30;
    // Desactive pendant l'intro (la camera est pilotee par l'animation).
    this.controls.enabled = false;
    this.startCameraAnim(CAMERA_FROM, CAMERA_TO, CAMERA_INTRO_MS);

    // Eclairage : ambiant genereux + soleil directionnel avec ombres.
    this.scene.add(new t.AmbientLight(0xffffff, 1.1));
    const sun = new t.DirectionalLight(0xfff7ec, 1.6);
    sun.position.set(7, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -11;
    sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.camera.far = 40;
    this.scene.add(sun);

    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(container);

    // Interaction tables : clic (si le pointeur n'a pas orbite) + survol.
    this.raycaster = new t.Raycaster();
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.pointerDownAt = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      const start = this.pointerDownAt;
      this.pointerDownAt = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_MOVE_PX) {
        return; // rotation de camera, pas un clic.
      }
      const view = this.pick(e);
      if (view) {
        this.tableClick.emit(view);
      }
    });
    dom.addEventListener('pointermove', (e) => this.syncHover(e));
    // Double-clic : recentre la camera sur la vue de reference (anti-perdu).
    dom.addEventListener('dblclick', () => {
      if (this.camera) {
        this.startCameraAnim(this.camera.position, CAMERA_TO, CAMERA_RESET_MS);
      }
    });
  }

  // Lance une animation de camera (ease in-out) ; les controls sont rendus a
  // l'utilisateur a la fin du trajet.
  private startCameraAnim(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    duration: number,
  ): void {
    this.cameraAnim = {
      from: { x: from.x, y: from.y, z: from.z },
      to,
      startedAt: performance.now(),
      duration,
    };
    if (this.controls) {
      this.controls.enabled = false;
    }
  }

  // Table sous le pointeur (raycast), ou null.
  private pick(event: PointerEvent): FloorTableView | null {
    const t = this.three;
    if (!t || !this.raycaster || !this.camera || !this.renderer) {
      return null;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new t.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.tableMeshes, false)[0];
    return hit ? (this.viewByUuid.get(hit.object.uuid) ?? null) : null;
  }

  // Survol : curseur pointeur + leger eclaircissement du plateau vise.
  private syncHover(event: PointerEvent): void {
    const view = this.pointerDownAt ? null : this.pick(event);
    const mesh = view
      ? (this.tableMeshes.find((m) => this.viewByUuid.get(m.uuid) === view) ?? null)
      : null;
    if (mesh === this.hovered) {
      return;
    }
    if (this.hovered) {
      (this.hovered.material as THREE.MeshLambertMaterial).emissive?.setHex(0x000000);
    }
    this.hovered = mesh;
    if (mesh) {
      (mesh.material as THREE.MeshLambertMaterial).emissive?.setHex(0x2a2a2a);
    }
    if (this.renderer) {
      this.renderer.domElement.style.cursor = mesh ? 'pointer' : 'grab';
    }
  }

  private syncSize(): void {
    if (!this.renderer || !this.camera) {
      return;
    }
    const container = this.host().nativeElement;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // Detruit et reconstruit le groupe « salle » (sol + murs + tables + etiquettes).
  private buildRoom(): void {
    const t = this.three;
    const scene = this.scene;
    if (!t || !scene) {
      return;
    }
    if (this.roomGroup) {
      scene.remove(this.roomGroup);
      this.roomGroup.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material?.dispose?.();
        }
      });
    }
    const group = new t.Group();
    this.roomGroup = group;
    // Les meshes sont recrees : on repart d'un registre d'interaction propre.
    this.tableMeshes = [];
    this.lateMeshes = [];
    this.viewByUuid.clear();
    this.hovered = null;

    // Sol chaleureux (recoit les ombres).
    const floor = new t.Mesh(
      new t.BoxGeometry(WORLD_W, 0.1, WORLD_D),
      new t.MeshLambertMaterial({ color: COLOR_FLOOR }),
    );
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    group.add(floor);

    // Murs : chaque segment devient un parallelepipede oriente.
    for (const w of this.walls()) {
      const x1 = (w.x1 - 0.5) * WORLD_W;
      const z1 = (w.y1 - 0.5) * WORLD_D;
      const x2 = (w.x2 - 0.5) * WORLD_W;
      const z2 = (w.y2 - 0.5) * WORLD_D;
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 0.01) {
        continue;
      }
      const thickness = Math.max(0.12, w.thickness * WORLD_D);
      const wall = new t.Mesh(
        new t.BoxGeometry(length, WALL_HEIGHT, thickness),
        new t.MeshLambertMaterial({ color: COLOR_WALL }),
      );
      wall.position.set((x1 + x2) / 2, WALL_HEIGHT / 2, (z1 + z2) / 2);
      wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    }

    for (const v of this.views()) {
      group.add(this.makeTable(v));
    }

    scene.add(group);
  }

  // Construit UNE table complete : plateau (nappe couleur statut ou bois),
  // pieds, chaises selon les couverts, etiquette. Repere local -> le groupe
  // porte position + rotation (les chaises tournent avec la table).
  private makeTable(v: FloorTableView): THREE.Group {
    const t = this.three!;
    const g = new t.Group();
    const x = (v.x - 0.5) * WORLD_W;
    const z = (v.y - 0.5) * WORLD_D;
    const wU = Math.max(0.3, v.w * WORLD_D);
    const dU = Math.max(0.3, v.h * WORLD_D);
    g.position.set(x, 0, z);
    // Konva tourne en degres horaires ; Three en radians trigonometriques.
    g.rotation.y = (-v.rotation * Math.PI) / 180;

    // Nappe : bois si libre (une table « nue »), couleur de statut sinon.
    const topColor =
      v.lateMinutes != null
        ? COLOR_LATE
        : v.status === 'installee'
          ? COLOR_SEATED
          : v.status === 'reservee'
            ? COLOR_RESERVED
            : COLOR_WOOD;

    const isRound = v.shape === 'round';
    const top = new t.Mesh(
      isRound
        ? new t.CylinderGeometry(wU / 2, wU / 2, TABLE_TOP_THICKNESS, 36)
        : new t.BoxGeometry(wU, TABLE_TOP_THICKNESS, dU),
      new t.MeshLambertMaterial({ color: topColor }),
    );
    top.position.y = TABLE_TOP_Y;
    top.castShadow = true;
    g.add(top);
    // Le plateau est LA surface cliquable de la table.
    this.tableMeshes.push(top);
    this.viewByUuid.set(top.uuid, v);
    // Table en retard : la nappe pulse (voir animate()).
    if (v.lateMinutes != null) {
      this.lateMeshes.push(top);
    }

    // Pieds : central (ronde) ou quatre coins (rect/carre/bar).
    const legMaterial = new t.MeshLambertMaterial({ color: COLOR_LEG });
    const legHeight = TABLE_TOP_Y - TABLE_TOP_THICKNESS / 2;
    if (isRound) {
      const pedestal = new t.Mesh(new t.CylinderGeometry(0.06, 0.06, legHeight, 12), legMaterial);
      pedestal.position.y = legHeight / 2;
      pedestal.castShadow = true;
      g.add(pedestal);
      const base = new t.Mesh(new t.CylinderGeometry(wU * 0.22, wU * 0.22, 0.04, 24), legMaterial);
      base.position.y = 0.02;
      g.add(base);
    } else {
      const inset = 0.09;
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const leg = new t.Mesh(new t.BoxGeometry(0.07, legHeight, 0.07), legMaterial);
        leg.position.set(sx * (wU / 2 - inset), legHeight / 2, sz * (dU / 2 - inset));
        leg.castShadow = true;
        g.add(leg);
      }
    }

    // Chaises : lisibilite immediate de la capacite (comme les sieges 2D).
    // Tables installees : une assiette devant chaque chaise (la salle « vit »).
    const chairMaterial = new t.MeshLambertMaterial({ color: COLOR_CHAIR });
    const plateMaterial = new t.MeshLambertMaterial({ color: COLOR_PLATE });
    const seated = v.status === 'installee';
    for (const slot of chairSlots(v.shape, wU, dU, v.table.capacity)) {
      const chair = new t.Group();
      const seat = new t.Mesh(new t.BoxGeometry(0.3, 0.05, 0.3), chairMaterial);
      seat.position.y = 0.24;
      seat.castShadow = true;
      const back = new t.Mesh(new t.BoxGeometry(0.3, 0.3, 0.045), chairMaterial);
      back.position.set(0, 0.42, 0.13);
      back.castShadow = true;
      chair.add(seat);
      chair.add(back);
      chair.position.set(slot.x, 0, slot.z);
      chair.rotation.y = slot.rotationY;
      g.add(chair);

      if (seated) {
        // Assiette posee au bord du plateau, devant la chaise.
        const toCenter = Math.hypot(slot.x, slot.z) || 1;
        const plate = new t.Mesh(new t.CylinderGeometry(0.1, 0.1, 0.015, 20), plateMaterial);
        plate.position.set(
          slot.x * (1 - 0.48 / toCenter),
          TABLE_TOP_Y + TABLE_TOP_THICKNESS / 2 + 0.01,
          slot.z * (1 - 0.48 / toCenter),
        );
        g.add(plate);
      }
    }

    // Etiquette contextuelle : nom + info de decision (client, heure, retard,
    // prochaine reservation d'une table libre).
    const parts = tableLabelParts(v);
    const label = this.makeLabel(parts.title, parts.subtitle, parts.color);
    if (label) {
      label.position.set(0, TABLE_TOP_Y + 0.95, 0);
      g.add(label);
    }
    return g;
  }

  // Etiquette « pilule » : canvas 2D -> texture -> sprite (toujours face camera).
  private makeLabel(title: string, subtitle: string | null, accent: string): THREE.Sprite | null {
    const t = this.three!;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 108;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    // Fond pilule blanc, discret, pour detacher le texte du decor.
    const pillW = subtitle ? 236 : 120;
    const pillX = (256 - pillW) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = '#d9d5cd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pillX, 12, pillW, 84, 20);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#37352f';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(title, 128, subtitle ? 50 : 66);
    if (subtitle) {
      ctx.font = '600 24px sans-serif';
      ctx.fillStyle = accent;
      ctx.fillText(subtitle, 128, 82);
    }
    const texture = new t.CanvasTexture(canvas);
    const sprite = new t.Sprite(new t.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(1.9, 0.8, 1);
    return sprite;
  }

  private animate(): void {
    const loop = (): void => {
      this.rafId = requestAnimationFrame(loop);
      const now = performance.now();

      // Animation camera (intro ou recentrage), ease in-out cubique.
      const anim = this.cameraAnim;
      if (anim && this.camera) {
        const p = Math.min(1, (now - anim.startedAt) / anim.duration);
        const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        this.camera.position.set(
          anim.from.x + (anim.to.x - anim.from.x) * eased,
          anim.from.y + (anim.to.y - anim.from.y) * eased,
          anim.from.z + (anim.to.z - anim.from.z) * eased,
        );
        this.camera.lookAt(0, 0, 0);
        if (p >= 1) {
          this.cameraAnim = null;
          if (this.controls) {
            this.controls.target.set(0, 0, 0);
            this.controls.enabled = true;
          }
        }
      }

      // Pulse d'urgence des nappes en retard (sinusoide douce, ~1,2 s).
      if (this.lateMeshes.length > 0) {
        const glow = 0.18 + 0.16 * Math.sin(now / 190);
        for (const mesh of this.lateMeshes) {
          const material = mesh.material as THREE.MeshLambertMaterial;
          material.emissive?.setScalar?.(Math.max(0, glow));
        }
      }

      this.controls?.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }
}
