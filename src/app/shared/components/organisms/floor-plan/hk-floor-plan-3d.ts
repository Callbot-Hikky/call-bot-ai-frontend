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
import { WallSegment } from '@core/models/floor-plan-editor.model';

type ThreeModule = typeof THREE;

// Monde 3D : la salle est projetee sur un sol de 16 x 10 unites (meme ratio que
// les canvas 2D). x normalise -> X * 16, y normalise -> Z * 10 ; les tailles
// (fractions du petit cote) -> * 10. Hauteurs choisies pour la lisibilite.
const WORLD_W = 16;
const WORLD_D = 10;
const WALL_HEIGHT = 1.15;
const TABLE_HEIGHT = 0.38;

// Couleurs alignees sur la legende 2D : libre = neutre, reservee = vert,
// installee = bleu, retard = rouge (teinte du plateau).
const COLOR_FLOOR = 0xf6f5f3;
const COLOR_WALL = 0xd8d6d1;
const COLOR_FREE = 0xffffff;
const COLOR_RESERVED = 0x30a46c;
const COLOR_SEATED = 0x3d7fd9;
const COLOR_LATE = 0xd64545;

// Seuil de « clic » : au-dela de ce deplacement (px), le geste est une rotation
// de camera (OrbitControls), pas une selection de table.
const CLICK_MOVE_PX = 6;

// Vue 3D INTERACTIVE de la salle, generee depuis NOS donnees (murs importes +
// tables + statuts derives). Toujours synchronisee avec le service en cours
// (polling -> statuts -> couleurs), et cliquable comme la 2D : une table emise
// au clic declenche les memes actions (drawer, walk-in, affectation).
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

  // Interaction : meshes de tables cliquables + vue associee (par uuid de mesh).
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
    container.appendChild(this.renderer.domElement);

    this.scene = new t.Scene();

    this.camera = new t.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(0, 12, 11);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15; // jamais sous le sol.
    this.controls.minDistance = 5;
    this.controls.maxDistance = 30;
    // Rotation lente automatique (ecran d'accueil) : s'arrete des qu'on manipule.
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.addEventListener('start', () => {
      if (this.controls) {
        this.controls.autoRotate = false;
      }
    });

    // Eclairage doux : ambiant + directionnel (leger relief sur les volumes).
    this.scene.add(new t.AmbientLight(0xffffff, 1.15));
    const sun = new t.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 14, 8);
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

  // Survol : curseur pointeur + leger eclaircissement de la table visee.
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
      (mesh.material as THREE.MeshLambertMaterial).emissive?.setHex(0x333333);
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
    this.viewByUuid.clear();
    this.hovered = null;

    // Sol.
    const floor = new t.Mesh(
      new t.BoxGeometry(WORLD_W, 0.1, WORLD_D),
      new t.MeshLambertMaterial({ color: COLOR_FLOOR }),
    );
    floor.position.y = -0.05;
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
      group.add(wall);
    }

    // Tables : volume par forme, couleur par statut, etiquette au-dessus.
    for (const v of this.views()) {
      const x = (v.x - 0.5) * WORLD_W;
      const z = (v.y - 0.5) * WORLD_D;
      const wU = Math.max(0.3, v.w * WORLD_D);
      const dU = Math.max(0.3, v.h * WORLD_D);

      const color =
        v.lateMinutes != null
          ? COLOR_LATE
          : v.status === 'installee'
            ? COLOR_SEATED
            : v.status === 'reservee'
              ? COLOR_RESERVED
              : COLOR_FREE;

      const geometry =
        v.shape === 'round'
          ? new t.CylinderGeometry(wU / 2, wU / 2, TABLE_HEIGHT, 32)
          : new t.BoxGeometry(wU, TABLE_HEIGHT, dU);
      const table = new t.Mesh(geometry, new t.MeshLambertMaterial({ color }));
      table.position.set(x, TABLE_HEIGHT / 2 + 0.02, z);
      // Konva tourne en degres horaires ; Three en radians trigonometriques.
      table.rotation.y = (-v.rotation * Math.PI) / 180;
      group.add(table);
      // Enregistre la table pour le clic/survol (raycast).
      this.tableMeshes.push(table);
      this.viewByUuid.set(table.uuid, v);

      // Etiquette : nom de table, + client si la table est occupee.
      const customer = v.status !== 'libre' ? v.reservation?.customerName : null;
      const label = this.makeLabel(v.table.name, customer ?? null);
      if (label) {
        label.position.set(x, TABLE_HEIGHT + 0.85, z);
        group.add(label);
      }
    }

    scene.add(group);
  }

  // Etiquette texte : canvas 2D -> texture -> sprite (toujours face camera).
  private makeLabel(title: string, subtitle: string | null): THREE.Sprite | null {
    const t = this.three!;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#37352f';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(title, 128, subtitle ? 40 : 58);
    if (subtitle) {
      ctx.font = '26px sans-serif';
      ctx.fillStyle = '#6b6b66';
      ctx.fillText(subtitle, 128, 76);
    }
    const texture = new t.CanvasTexture(canvas);
    const sprite = new t.Sprite(new t.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(2.1, 0.79, 1);
    return sprite;
  }

  private animate(): void {
    const loop = (): void => {
      this.rafId = requestAnimationFrame(loop);
      this.controls?.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }
}
