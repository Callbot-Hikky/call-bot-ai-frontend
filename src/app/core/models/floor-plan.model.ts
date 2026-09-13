import { Reservation } from './reservation.model';
import { FloorTable } from './table.model';
import { formatTime } from '@core/utils/format';
import {
  EditorTable,
  GeometryMap,
  TableShape,
  defaultGeometryFor,
  gridPosition,
} from './floor-plan-editor.model';

// V1 : 3 statuts seulement, 100 % derives des reservations (doc 05 correctif 2).
//  - libre    : aucune reservation active sur la table
//  - reservee : une reservation confirmed/pending ACTIVE au moment courant
//  - installee: une reservation seated sur la table aujourd'hui
export type FloorTableStatus = 'libre' | 'reservee' | 'installee';

// DERIVATION TEMPORELLE (poste de commandement) : fenetres FIXES, car le modele
// front n'expose pas endsAt. Une resa confirmed/pending est « active » sur sa
// table de 45 min AVANT son heure a 120 min APRES (duree de service type).
export const ACTIVE_BEFORE_MIN = 45;
export const ACTIVE_AFTER_MIN = 120;
// Retard signale a partir de +15 min apres l'heure prevue (sans installation).
export const LATE_THRESHOLD_MIN = 15;

const MINUTE_MS = 60_000;

// Une table positionnee sur le plan : coordonnees NORMALISEES 0..1 (decision 1).
// On serialise NOTRE modele, jamais le Stage Konva.
// Depuis le LOT A, la vue service rend aussi la geometrie du plan edite :
// taille (w/h, fractions du PETIT COTE du conteneur), forme et rotation.
export interface PlacedTable {
  table: FloorTable;
  // Centre de la table, normalise dans le conteneur (0..1).
  x: number;
  y: number;
  // Dimensions normalisees sur le petit cote (echelle unique, cf. tableSizePx).
  w: number;
  h: number;
  shape: TableShape;
  rotation: number;
}

// Etat complet d'une table pour le rendu (position + statut + resa courante).
export interface FloorTableView extends PlacedTable {
  status: FloorTableStatus;
  // Reservation a afficher au clic (la plus pertinente, cf. derivation).
  reservation: Reservation | null;
  // Table LIBRE avec une resa plus tard aujourd'hui : heure courte de la prochaine
  // (« 21:00 ») pour l'info de decision de l'hote. null sinon.
  nextTime: string | null;
  // ISO de cette prochaine resa (garde-fou temporel du walk-in). null sinon.
  nextDateTime: string | null;
  // Table RESERVEE dont l'heure est depassee de plus de LATE_THRESHOLD_MIN sans
  // installation : minutes de retard (arrondies). null sinon.
  lateMinutes: number | null;
}

export interface DerivedTableStatus {
  status: FloorTableStatus;
  reservation: Reservation | null;
  nextTime: string | null;
  nextDateTime: string | null;
  lateMinutes: number | null;
}

// Derive le statut d'une table a partir des reservations du jour qui lui sont
// reliees ET de l'heure courante (`now` en parametre = tests deterministes ;
// en prod, capture dans le computed de hk-floor-plan, rafraichi par le polling).
// Regle temporelle (session 10x n°2) :
//  1. une resa `seated` -> Installee (et c'est la resa a afficher) ;
//  2. sinon une resa `confirmed`/`pending` ACTIVE, c.-a-d.
//     now ∈ [dateTime − 45 min, dateTime + 120 min] -> Reservee (afficher la plus
//     proche de now) ; si now > dateTime + 15 min -> lateMinutes (alerte retard) ;
//  3. sinon s'il existe une resa PLUS TARD (dateTime − 45 min > now) -> Libre avec
//     nextTime (heure de la plus proche) ;
//  4. sinon -> Libre simple. Une resa depassee de +120 min sans installation rend
//     la table libre (la resa reste en liste, au staff de l'annuler) ;
//     completed/cancelled/no_show = non actif -> Libre.
//
// `projected` (mode SIMULATION) : en live, une table seated reste installee tant
// que le staff n'a pas termine le service (regle 1, sans horloge). En projection
// du futur, on l'estime liberee apres la duree de service (+120 min) - sinon la
// simulation mentirait (« occupee pour toujours »).
export function deriveTableStatus(
  tableId: string,
  reservations: readonly Reservation[],
  now: Date,
  projected = false,
): DerivedTableStatus {
  const linked = reservations.filter((r) => r.table?.id === tableId);
  const none = { nextTime: null, nextDateTime: null, lateMinutes: null };
  const nowProjectedMs = now.getTime();

  const seated = linked.find((r) => r.status === 'seated');
  if (seated) {
    const stillThere =
      !projected ||
      nowProjectedMs <= new Date(seated.dateTime).getTime() + ACTIVE_AFTER_MIN * MINUTE_MS;
    if (stillThere) {
      return { status: 'installee', reservation: seated, ...none };
    }
    // Projection au-dela du service estime : la table redevient disponible
    // (la suite de la derivation gere une eventuelle resa plus tard).
  }

  const upcoming = linked
    .filter((r) => r.status === 'confirmed' || r.status === 'pending')
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  const nowMs = now.getTime();

  // Resas ACTIVES au moment courant : la plus proche de now est celle a afficher.
  const active = upcoming
    .filter((r) => {
      const t = new Date(r.dateTime).getTime();
      return (
        nowMs >= t - ACTIVE_BEFORE_MIN * MINUTE_MS && nowMs <= t + ACTIVE_AFTER_MIN * MINUTE_MS
      );
    })
    .sort(
      (a, b) =>
        Math.abs(new Date(a.dateTime).getTime() - nowMs) -
        Math.abs(new Date(b.dateTime).getTime() - nowMs),
    );
  if (active.length > 0) {
    const current = active[0];
    const elapsedMin = (nowMs - new Date(current.dateTime).getTime()) / MINUTE_MS;
    return {
      status: 'reservee',
      reservation: current,
      nextTime: null,
      nextDateTime: null,
      // RETARD : concept TEMPS REEL uniquement. En projection (simulation), on
      // suppose que le client arrivera a l'heure - signaler « +30 min » sur une
      // resa future serait un mensonge visuel.
      lateMinutes: !projected && elapsedMin > LATE_THRESHOLD_MIN ? Math.round(elapsedMin) : null,
    };
  }

  // Libre, mais reservee PLUS TARD : on expose l'heure de la prochaine resa.
  const later = upcoming.find(
    (r) => new Date(r.dateTime).getTime() - ACTIVE_BEFORE_MIN * MINUTE_MS > nowMs,
  );
  if (later) {
    return {
      status: 'libre',
      reservation: null,
      nextTime: formatTime(later.dateTime),
      nextDateTime: later.dateTime,
      lateMinutes: null,
    };
  }

  return { status: 'libre', reservation: null, ...none };
}

// JOURNEE PREVISIONNELLE (un autre jour que le jour courant) : l'horloge ne dit
// rien sur ce jour-la. On lit la journee entiere : une table avec une resa
// vivante est « reservee » (la premiere affichee, la suivante en `nextTime`),
// une resa installee reste « installee », sinon la table est libre. Pas de
// retard : le concept n'a de sens qu'en temps reel.
export function deriveForecastStatus(
  tableId: string,
  reservations: readonly Reservation[],
): DerivedTableStatus {
  const linked = reservations.filter((r) => r.table?.id === tableId);
  const none = { nextTime: null, nextDateTime: null, lateMinutes: null };
  const seated = linked.find((r) => r.status === 'seated');
  if (seated) {
    return { status: 'installee', reservation: seated, ...none };
  }
  const upcoming = linked
    .filter((r) => r.status === 'confirmed' || r.status === 'pending')
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  if (upcoming.length === 0) {
    return { status: 'libre', reservation: null, ...none };
  }
  const [first, second] = upcoming;
  return {
    status: 'reservee',
    reservation: first,
    nextTime: second ? formatTime(second.dateTime) : null,
    nextDateTime: second?.dateTime ?? null,
    lateMinutes: null,
  };
}

// RETARD d'une reservation attendue (badge de la LISTE) : memes seuils que la
// pastille du plan - signale de +15 min (LATE_THRESHOLD_MIN) jusqu'a la fin de
// la fenetre active (+120 min, ACTIVE_AFTER_MIN). Au-dela, le plan considere la
// table liberee (no-show a annuler) : la liste arrete donc aussi de crier.
export function reservationLateMinutes(reservation: Reservation, now: Date): number | null {
  if (reservation.status !== 'pending' && reservation.status !== 'confirmed') {
    return null;
  }
  const elapsedMin = (now.getTime() - new Date(reservation.dateTime).getTime()) / MINUTE_MS;
  if (elapsedMin <= LATE_THRESHOLD_MIN || elapsedMin > ACTIVE_AFTER_MIN) {
    return null;
  }
  return Math.round(elapsedMin);
}

// PLAGE DE SIMULATION (« Simuler ma soiree ») : de 1 h avant la premiere
// reservation vivante du jour a 2 h apres la derniere, bornes arrondies a
// l'heure pleine. Sans reservation : soiree type 18:00 -> 23:00. Fonction PURE :
// c'est elle qui donne au slider temporel ses bornes.
export function simulationRange(
  reservations: readonly Reservation[],
  today = new Date(),
): { start: Date; end: Date } {
  const alive = reservations.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
  const floorHour = (ms: number): Date => {
    const d = new Date(ms);
    d.setMinutes(0, 0, 0);
    return d;
  };
  const ceilHour = (ms: number): Date => {
    const d = new Date(ms);
    if (d.getMinutes() > 0 || d.getSeconds() > 0) {
      d.setHours(d.getHours() + 1);
    }
    d.setMinutes(0, 0, 0);
    return d;
  };

  if (alive.length === 0) {
    const start = new Date(today);
    start.setHours(18, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 0, 0, 0);
    return { start, end };
  }

  const times = alive.map((r) => new Date(r.dateTime).getTime());
  return {
    start: floorHour(Math.min(...times) - 60 * MINUTE_MS),
    end: ceilHour(Math.max(...times) + 120 * MINUTE_MS),
  };
}

// --- FUSION DE TABLES ------------------------------------------------------------
// Deux tables collees peuvent etre FUSIONNEES (groupe d'anniversaire, grande
// tablee) : le plan stocke des groupes d'ids (`merges`), et la vue service rend
// chaque groupe comme UNE tablee (bloc englobant, couverts sommes, statut
// dominant). Les reservations restent portees par les VRAIES tables : la vue
// fusionnee garde l'id de la premiere table (ancre) -> walk-in, affectation et
// drawer fonctionnent sans changement.

// Largeur du conteneur en unites « petit cote » (ratio 16:10 des canvas).
const ASPECT_W = 1.6;

// Deux geometries se touchent-elles ? Rects englobants en unites petit cote.
// `rotation` est FACULTATIVE mais prise en compte quand elle est fournie : sans
// elle, deux tables pivotees collees bord a bord etaient jugees separees (bouton
// Fusionner grise a tort) ou l'inverse. Les appelants qui passent deja une
// emprise pivotee peuvent l'omettre : rotatedBox est alors l'identite.
export function tablesTouch(
  a: { x: number; y: number; w: number; h: number; rotation?: number },
  b: { x: number; y: number; w: number; h: number; rotation?: number },
  gap = 0.035,
): boolean {
  const ra = rotatedBox(a);
  const rb = rotatedBox(b);
  const dx = Math.abs(ra.x * ASPECT_W - rb.x * ASPECT_W) - (ra.w + rb.w) / 2;
  const dy = Math.abs(ra.y - rb.y) - (ra.h + rb.h) / 2;
  return dx <= gap && dy <= gap;
}

// COTES BLOQUES d'une table : les cotes ou une AUTRE table est collee (pas de
// chaises entre deux tables bord a bord - elles traverseraient le plateau
// voisin). Oriente ecran : n = au-dessus, s = dessous, w = gauche, e = droite.
export interface BlockedSides {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
}

// Valeur neutre partagee (aucun cote bloque) : les moteurs de rendu 2D/3D/
// editeur consomment la MEME reference par defaut.
export const NO_BLOCKED_SIDES: Readonly<BlockedSides> = { n: false, s: false, e: false, w: false };

// Seuil de CONTACT pour le blocage des chaises : plus STRICT que tablesTouch
// (0.035, tolerance de fusion) - les rangees generees (espacement 0.032) ne
// doivent PAS perdre leurs chaises, seules les tables reellement bord a bord.
const BLOCK_GAP = 0.015;

// Cotes dans l'ordre des angles ECRAN croissants : 0 deg = est, 90 = sud (y
// vers le bas), 180 = ouest, 270 = nord. Sert a convertir un cote ecran en cote
// local quand la table est pivotee.
const SIDE_BY_SCREEN_ANGLE: (keyof BlockedSides)[] = ['e', 's', 'w', 'n'];

export function blockedSides(
  table: { x: number; y: number; w: number; h: number; rotation?: number },
  others: readonly { x: number; y: number; w: number; h: number; rotation?: number }[],
  gap = BLOCK_GAP,
): BlockedSides {
  // Contacts calcules en repere ECRAN, sur les emprises PIVOTEES : une table a
  // 90 deg a largeur et hauteur echangees, sans quoi les contacts sont faux.
  const ta = rotatedBox(table);
  const screen: BlockedSides = { n: false, s: false, e: false, w: false };
  for (const b of others) {
    const bb = rotatedBox(b);
    const dx = Math.abs(ta.x * ASPECT_W - bb.x * ASPECT_W) - (ta.w + bb.w) / 2;
    const dy = Math.abs(ta.y - bb.y) - (ta.h + bb.h) / 2;
    if (dx > gap || dy > gap) {
      continue; // pas collees.
    }
    // L'axe du contact est celui dont l'ecart est le plus GRAND (le bord
    // commun) ; l'autre axe doit VRAIMENT se chevaucher (ecart negatif), sinon
    // c'est un simple contact de coin - aucune chaise a masquer.
    if (dx >= dy) {
      if (dy >= 0) {
        continue;
      }
      if (bb.x > ta.x) {
        screen.e = true;
      } else {
        screen.w = true;
      }
    } else {
      if (dx >= 0) {
        continue;
      }
      if (bb.y > ta.y) {
        screen.s = true;
      } else {
        screen.n = true;
      }
    }
  }

  // REPROJECTION ecran -> LOCAL. layoutSeats pose les chaises dans le repere du
  // groupe Konva, qui a DEJA subi la rotation de la table : un contact a l'est
  // de l'ecran correspond, pour une table a 90 deg, a son cote nord local.
  // Sans cette conversion on masquerait les chaises du mauvais cote.
  const steps = Math.round(((((table.rotation ?? 0) % 360) + 360) % 360) / 90) % 4;
  if (steps === 0) {
    return screen;
  }
  const local: BlockedSides = { n: false, s: false, e: false, w: false };
  SIDE_BY_SCREEN_ANGLE.forEach((side, i) => {
    local[side] = screen[SIDE_BY_SCREEN_ANGLE[(i + steps) % 4]];
  });
  return local;
}

// ANTI-CHEVAUCHEMENT (editeur) : repousse une table deplacee pour garantir un
// petit ecart (minGap, unites petit cote) avec ses voisines NON fusionnees.
// L'ecart choisi (0.02) est > BLOCK_GAP (les chaises restent dessinees) et
// < la tolerance de fusion (0.035) : les tables restent fusionnables en un
// clic, mais ne se chevauchent jamais par accident.
// Ecart mini APRES correction. Calibre sur les CHAISES, pas sur les plateaux :
// une chaise porte a SEAT_GAP + son rayon (~10,5 px) au-dela du bord, donc il
// faut ~21 px entre deux plateaux pour que les deux couronnes ne se recouvrent
// pas. A 0.016 (~11 px) les chaises restaient dessinees ET se chevauchaient :
// c'etait la pire valeur possible, juste au-dessus de BLOCK_GAP (0.015) qui
// aurait masque les chaises du cote colle.
// Reste sous la tolerance de fusion (0.035) : deux tables ainsi ecartees sont
// toujours fusionnables en un clic pour faire une grande tablee.
// Fenetre de reglage tres etroite : >= 0.0305 (chaises) et < 0.035 (fusion), en
// restant SOUS l'espacement des rangees generees (0.021 * 1.6 = 0.0336), sinon
// une rangee tout juste creee se repousse elle-meme et perd son alignement.
export const EDITOR_MIN_GAP = 0.031;

// Ecart mini table <-> MUR : volontairement bien plus fin qu'entre deux tables.
// En salle une table se pose CONTRE le mur ; on veut juste qu'elle ne le
// chevauche pas, pas qu'elle s'en ecarte visiblement.
export const WALL_MIN_GAP = 0.006;

// Murs vus comme OBSTACLES rectangulaires, dans le meme repere que les tables
// (x en unites petit cote, d'ou le * ASPECT_W). Les murs d'un plan de salle sont
// horizontaux ou verticaux : cette boite est alors EXACTE, pas une approximation.
// Un mur oblique serait sur-couvert par sa boite englobante (on bloque un peu
// trop), jamais sous-couvert : on ne laisse pas passer une table au travers.
export function wallObstacles(
  walls: readonly { x1: number; y1: number; x2: number; y2: number; thickness: number }[],
): { x: number; y: number; w: number; h: number }[] {
  return walls.map((w) => {
    const minX = Math.min(w.x1, w.x2);
    const maxX = Math.max(w.x1, w.x2);
    const minY = Math.min(w.y1, w.y2);
    const maxY = Math.max(w.y1, w.y2);
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      w: (maxX - minX) * ASPECT_W + w.thickness,
      h: maxY - minY + w.thickness,
    };
  });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Emprise REELLE d'une table pivotee. Une table a 90 deg occupe a l'ecran une
// zone dont largeur et hauteur sont echangees ; l'anti-chevauchement raisonnait
// sur les dimensions NON tournees, donc sur une fausse emprise, et laissait deux
// tables pivotees se recouvrir (cas des plans importes, ou presque toutes les
// tables ont une rotation). Formule generale : exacte a 0/90/180/270 deg, et
// conservatrice (boite englobante) pour un angle quelconque.
export function rotatedBox(t: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}): Box {
  const rad = ((t.rotation ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { x: t.x, y: t.y, w: t.w * c + t.h * s, h: t.w * s + t.h * c };
}

// Vrai si la table posee en (x,y) empiete encore sur l'une des boites.
// Tolerance d'arrondi. La poussee divise par ASPECT_W et ce controle remultiplie
// par ASPECT_W : l'aller-retour n'est pas exact en flottant et `dx` retombe a
// `minGap - 1 ulp`. Sans epsilon, un degagement PARFAIT etait declare en echec
// environ une fois sur deux, ce qui annulait le degagement sur un seul axe.
const GAP_EPS = 1e-9;

function overlapsAny(
  x: number,
  y: number,
  moved: Box,
  others: readonly Box[],
  minGap: number,
): boolean {
  return others.some((o) => {
    const dx = Math.abs(x * ASPECT_W - o.x * ASPECT_W) - (moved.w + o.w) / 2;
    const dy = Math.abs(y - o.y) - (moved.h + o.h) / 2;
    return dx < minGap - GAP_EPS && dy < minGap - GAP_EPS;
  });
}

// Une resolution. `lockAxis` : degager sur un seul axe (plus previsible a
// l'oeil) au lieu de laisser chaque voisine choisir le sien (diagonale).
function resolveOverlaps(
  moved: Box,
  others: readonly Box[],
  minGap: number,
  lockAxis: boolean,
): { x: number; y: number } {
  let x = moved.x;
  let y = moved.y;
  let axis: 'x' | 'y' | null = null;
  for (let pass = 0; pass < 4; pass++) {
    let collided = false;
    for (const o of others) {
      const dx = Math.abs(x * ASPECT_W - o.x * ASPECT_W) - (moved.w + o.w) / 2;
      const dy = Math.abs(y - o.y) - (moved.h + o.h) / 2;
      if (dx >= minGap || dy >= minGap) {
        continue; // assez separees sur au moins un axe.
      }
      collided = true;
      // Axe demandant la PLUS PETITE correction pour cette voisine.
      const pushX = minGap - dx;
      const pushY = minGap - dy;
      const preferred: 'x' | 'y' = pushX <= pushY ? 'x' : 'y';
      axis ??= preferred;
      if ((lockAxis ? axis : preferred) === 'x') {
        x += ((x >= o.x ? 1 : -1) * pushX) / ASPECT_W;
      } else {
        y += (y >= o.y ? 1 : -1) * pushY;
      }
    }
    if (!collided) {
      break;
    }
  }
  return { x, y };
}

// ANTI-CHEVAUCHEMENT : on tente d'abord un degagement sur UN SEUL axe, plus
// previsible a l'oeil (sinon une table coincee entre deux voisines part en
// diagonale). Mais un axe unique ne resout pas toutes les configurations : dans
// un angle, la table degagee d'une voisine peut venir en recouvrir une autre.
// On verifie donc le resultat et, s'il reste un empietement, on rejoue en
// laissant chaque voisine choisir son axe. Ne JAMAIS laisser deux tables se
// chevaucher prime sur le confort visuel du deplacement.
export function pushApart(
  moved: Box,
  others: readonly Box[],
  minGap = EDITOR_MIN_GAP,
): { x: number; y: number } {
  // On borne l'EMPRISE, pas le centre : borner le centre a [0,1] laissait la
  // moitie d'une table depasser hors du plan (visible a l'import, ou des tables
  // sortaient du cadre a droite). Les demi-largeurs sont en unites petit cote,
  // d'ou la division par ASPECT_W pour revenir en fraction de largeur.
  const halfW = moved.w / 2 / ASPECT_W;
  const halfH = moved.h / 2;
  const clamp = (p: { x: number; y: number }) => ({
    // Table plus large que le plan : on la centre plutot que de l'inverser.
    x: halfW * 2 >= 1 ? 0.5 : Math.max(halfW, Math.min(1 - halfW, p.x)),
    y: halfH * 2 >= 1 ? 0.5 : Math.max(halfH, Math.min(1 - halfH, p.y)),
  });

  // On teste la position CLAMPEE, pas la brute : contre un bord, une table
  // poussee au-dela de 1 est ramenee a 1, donc parfois remise dans la voisine
  // dont on venait de la degager. Valider la position brute laissait passer ce
  // chevauchement-la.
  const single = clamp(resolveOverlaps(moved, others, minGap, true));
  if (!overlapsAny(single.x, single.y, moved, others, minGap)) {
    return single;
  }
  return clamp(resolveOverlaps(moved, others, minGap, false));
}

// ANGLES LIBRES d'une table RONDE : repartit `count` chaises uniformement sur
// les arcs NON bloques (quadrant de 90° par cote colle). Repere ecran : angle 0
// = est, PI/2 = sud (y vers le bas) - identique en 2D (x,y) et 3D (x,z).
// Aucune chaise n'est perdue : elles se resserrent sur les arcs libres.
export function freeRingAngles(count: number, blocked: BlockedSides): number[] {
  const sides: { side: keyof BlockedSides; center: number }[] = [
    { side: 'e', center: 0 },
    { side: 's', center: Math.PI / 2 },
    { side: 'w', center: Math.PI },
    { side: 'n', center: (3 * Math.PI) / 2 },
  ];
  const free = sides.filter((s) => !blocked[s.side]);
  if (free.length === 0 || count <= 0) {
    return [];
  }
  if (free.length === 4) {
    return Array.from({ length: count }, (_, i) => (i / count) * 2 * Math.PI);
  }
  // Chaque cote libre porte un arc de 90° centre sur lui ; les chaises sont
  // reparties proportionnellement, en evitant les bords d'arc (marge 10 %).
  const angles: number[] = [];
  let placed = 0;
  for (const [i, s] of free.entries()) {
    const k =
      i === free.length - 1
        ? count - placed
        : Math.min(count - placed, Math.round(count / free.length));
    placed += k;
    const span = (Math.PI / 2) * 0.8;
    for (let j = 0; j < k; j++) {
      const t = k === 1 ? 0.5 : j / (k - 1);
      angles.push(s.center - span / 2 + t * span);
    }
  }
  return angles;
}

// Un groupe est fusionnable si chaque table touche au moins une autre du groupe
// (chaine de tables collees, pas forcement toutes mutuellement en contact).
export function canMerge(
  entries: readonly { x: number; y: number; w: number; h: number; rotation?: number }[],
): boolean {
  if (entries.length < 2) {
    return false;
  }
  return entries.every((a, i) => entries.some((b, j) => i !== j && tablesTouch(a, b)));
}

// Ordre de dominance d'un statut pour la vue fusionnee (le plus « occupe » gagne).
const STATUS_RANK: Record<FloorTableStatus, number> = { libre: 0, reservee: 1, installee: 2 };

// Remplace les vues des tables fusionnees par UNE vue de tablee par groupe.
export function mergeViews(
  views: readonly FloorTableView[],
  merges: readonly (readonly string[])[],
): FloorTableView[] {
  if (merges.length === 0) {
    return [...views];
  }
  const byId = new Map(views.map((v) => [v.table.id, v]));
  const consumed = new Set<string>();
  const blocks: FloorTableView[] = [];

  for (const group of merges) {
    const members = group
      .map((id) => byId.get(id))
      .filter((v): v is FloorTableView => v != null && !consumed.has(v.table.id));
    if (members.length < 2) {
      continue; // groupe incomplet (table supprimee) : on l'ignore.
    }
    members.forEach((m) => consumed.add(m.table.id));

    // Bloc englobant en unites petit cote, re-normalise ensuite.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const m of members) {
      minX = Math.min(minX, m.x * ASPECT_W - m.w / 2);
      maxX = Math.max(maxX, m.x * ASPECT_W + m.w / 2);
      minY = Math.min(minY, m.y - m.h / 2);
      maxY = Math.max(maxY, m.y + m.h / 2);
    }

    // Vue dominante : la plus occupee (retard prioritaire a rang egal). Elle
    // porte le statut, la reservation ET l'identite du bloc, pour que les actions
    // (finish/unassign/cancel) et l'affichage visent la MEME table que la resa
    // montree. Quand tout est libre, le dominant reste members[0] (tri stable),
    // donc le walk-in vise bien la premiere table du groupe.
    const dominant = [...members].sort(
      (a, b) =>
        STATUS_RANK[b.status] - STATUS_RANK[a.status] ||
        (b.lateMinutes ?? -1) - (a.lateMinutes ?? -1),
    )[0];

    // Prochaine resa de la TABLEE = la plus proche parmi TOUS les membres (le
    // garde-fou walk-in doit voir la resa d'un membre non dominant).
    const next = members
      .filter((m) => m.nextDateTime !== null)
      .sort((a, b) => (a.nextDateTime as string).localeCompare(b.nextDateTime as string))[0];

    blocks.push({
      ...dominant,
      nextTime: next?.nextTime ?? null,
      nextDateTime: next?.nextDateTime ?? null,
      // Le DOMINANT porte l'identite : les actions ciblent la table qui porte la
      // resa affichee ; la capacite affichee est la somme du groupe, le nom liste
      // tous les membres.
      table: {
        ...dominant.table,
        name: members.map((m) => m.table.name).join('+'),
        capacity: members.reduce((sum, m) => sum + m.table.capacity, 0),
      },
      x: (minX + maxX) / 2 / ASPECT_W,
      y: (minY + maxY) / 2,
      w: maxX - minX,
      h: maxY - minY,
      shape: 'rect',
      rotation: 0,
    });
  }

  return [...views.filter((v) => !consumed.has(v.table.id)), ...blocks];
}

// SYNTHESE DE SALLE (mode service) : agrege les statuts des tables pour le bandeau
// « poste d'accueil ». Fonction PURE (testable sans monter de composant) :
//  - libres/reservees/installees : nombre de tables par statut ;
//  - couverts : total des couverts effectivement EN SALLE (tables reservees +
//    installees qui portent une reservation) - la charge reelle du service.
export interface RoomSummary {
  libres: number;
  reservees: number;
  installees: number;
  couverts: number;
}

export function summarizeRoom(views: readonly FloorTableView[]): RoomSummary {
  let libres = 0;
  let reservees = 0;
  let installees = 0;
  let couverts = 0;
  for (const view of views) {
    if (view.status === 'libre') {
      libres += 1;
    } else if (view.status === 'reservee') {
      reservees += 1;
    } else {
      installees += 1;
    }
    if (view.reservation && view.status !== 'libre') {
      couverts += view.reservation.partySize;
    }
  }
  return { libres, reservees, installees, couverts };
}

// MEILLEUR FIT (LOT B2) : pendant l'affectation, la table recommandee est la table
// LIBRE de capacite MINIMALE suffisante (>= couverts). A egalite de capacite, la
// premiere rencontree. null si aucune table libre ne suffit.
// GARDE-FOU HORAIRE (optionnel) : avec `dateTime` (l'heure de la resa a placer),
// une table libre dont la PROCHAINE resa tombe a moins d'une duree de service
// (ACTIVE_AFTER_MIN) est ecartee - on ne cree pas de double-booking silencieux.
export function bestFitTableId(
  views: readonly FloorTableView[],
  partySize: number,
  dateTime?: string | null,
): string | null {
  let best: FloorTableView | null = null;
  let bestBar: FloorTableView | null = null;
  for (const view of views) {
    if (view.status !== 'libre' || view.table.capacity < partySize) {
      continue;
    }
    if (dateTime && view.nextDateTime) {
      const gapMin = Math.abs(
        (new Date(dateTime).getTime() - new Date(view.nextDateTime).getTime()) / MINUTE_MS,
      );
      if (gapMin < ACTIVE_AFTER_MIN) {
        continue;
      }
    }
    // Le BAR est un DERNIER RECOURS : on n'assoit pas une tablee au comptoir
    // quand une vraie table convient.
    if (view.shape === 'bar') {
      if (!bestBar || view.table.capacity < bestBar.table.capacity) {
        bestBar = view;
      }
      continue;
    }
    if (!best || view.table.capacity < best.table.capacity) {
      best = view;
    }
  }
  return (best ?? bestBar)?.table.id ?? null;
}

// PLACEMENT AUTO (« Tout placer ») : propose une table pour CHAQUE resa non placee,
// en glouton - les plus grandes tablees d'abord (les plus dures a caser), chaque
// table proposee au plus une fois. Fonction PURE : le composant emet ensuite les
// affectations reelles ; les resas sans solution restent simplement non placees.
export interface AutoPlacement {
  reservationId: string;
  tableId: string;
}

export function planAutoPlacements(
  views: readonly FloorTableView[],
  reservations: readonly Reservation[],
): AutoPlacement[] {
  const taken = new Set<string>();
  const placements: AutoPlacement[] = [];
  for (const r of [...reservations].sort((a, b) => b.partySize - a.partySize)) {
    const candidates = views.filter((v) => !taken.has(v.table.id));
    const tableId = bestFitTableId(candidates, r.partySize, r.dateTime);
    if (tableId) {
      taken.add(tableId);
      placements.push({ reservationId: r.id, tableId });
    }
  }
  return placements;
}

// JAUGE DE SOIREE : charge attendue de la salle - somme des couverts des resas
// VIVANTES du jour (pending/confirmed/seated) rapportee a la capacite totale.
// Le restaurateur lit d'un coup d'oeil « la soiree est a 44 % » sans compter.
export interface EveningLoad {
  couverts: number;
  capacity: number;
  pct: number;
}

export function eveningLoad(
  reservations: readonly Reservation[],
  tables: readonly { capacity: number }[],
): EveningLoad {
  const couverts = reservations
    .filter((r) => r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated')
    .reduce((sum, r) => sum + r.partySize, 0);
  const capacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  return { couverts, capacity, pct: capacity > 0 ? Math.round((100 * couverts) / capacity) : 0 };
}

// SUGGESTION DE FUSION : quand AUCUNE table libre ne suffit, chercher un petit
// groupe (2 puis 3) de tables LIBRES et VOISINES (tablesTouch) dont la somme des
// couverts suffit - capacite totale minimale d'abord (on ne gaspille pas la
// salle). Les tables deja membres d'une tablee sont ecartees (leur bloc fusionne
// porte deja la capacite sommee). null si rien ne convient.
export function suggestMergeGroup(
  views: readonly FloorTableView[],
  partySize: number,
  merges: readonly (readonly string[])[] = [],
): FloorTableView[] | null {
  const mergedIds = new Set(merges.flat());
  const free = views.filter((v) => v.status === 'libre' && !mergedIds.has(v.table.id));

  const touching = (a: FloorTableView, b: FloorTableView): boolean =>
    tablesTouch(
      { x: a.x, y: a.y, w: a.w, h: a.h, rotation: a.rotation },
      { x: b.x, y: b.y, w: b.w, h: b.h, rotation: b.rotation },
    );
  const capacity = (group: readonly FloorTableView[]): number =>
    group.reduce((sum, v) => sum + v.table.capacity, 0);

  let best: FloorTableView[] | null = null;
  const consider = (group: FloorTableView[]): void => {
    if (capacity(group) >= partySize && (!best || capacity(group) < capacity(best))) {
      best = group;
    }
  };

  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (touching(free[i], free[j])) {
        consider([free[i], free[j]]);
      }
    }
  }
  if (best) {
    return best;
  }
  // Pas de paire suffisante : chaines de 3 (le tiers touche l'un des deux).
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (!touching(free[i], free[j])) {
        continue;
      }
      for (let k = 0; k < free.length; k++) {
        if (k !== i && k !== j && (touching(free[k], free[i]) || touching(free[k], free[j]))) {
          consider([free[i], free[j], free[k]]);
        }
      }
    }
  }
  return best;
}

// HEURE SUR LA TABLE (LOT B5) : une table Reservee ou Installee affiche l'heure de
// SA reservation (petit texte sous la capacite). Choix sobre : la meme heure courte
// pour les deux statuts (pas de prefixe « depuis » - la couleur porte deja le statut).
// ALERTE RETARD : une table Reservee en retard complete l'heure avec « · +25 min »
// (la pastille passe en couleur danger cote canvas).
export function tableTimeLabel(
  view: Pick<FloorTableView, 'status' | 'reservation' | 'lateMinutes'>,
): string {
  if (!view.reservation || view.status === 'libre') {
    return '';
  }
  const time = formatTime(view.reservation.dateTime);
  if (view.status === 'reservee' && view.lateMinutes !== null) {
    return `${time} · +${view.lateMinutes} min`;
  }
  return time;
}

// Place les tables en grille automatique, en coordonnees normalisees 0..1.
// Repli quand aucune geometrie n'a ete editee : position auto-grille + forme et
// taille derivees de la capacite. La conversion en pixels se fait au rendu.
export function autoGridLayout(tables: readonly FloorTable[]): PlacedTable[] {
  const count = tables.length;
  return tables.map((table, i) => {
    const geo = defaultGeometryFor(table.capacity, gridPosition(i, count));
    return { table, x: geo.x, y: geo.y, w: geo.w, h: geo.h, shape: geo.shape, rotation: 0 };
  });
}

// BRIDGE editeur -> vue service (LOT A) : place les tables reelles en utilisant la
// geometrie SAUVEGARDEE du plan quand elle existe (position + taille + forme +
// rotation), et le repli auto-grille sinon. Les ids etant ceux du back, la
// derivation de statut (deriveTableStatus) matche directement.
export function layoutTables(tables: readonly FloorTable[], geometry: GeometryMap): PlacedTable[] {
  const fallback = autoGridLayout(tables);
  return fallback.map((placed) => {
    const geo = geometry[placed.table.id];
    if (!geo) {
      return placed;
    }
    return {
      table: placed.table,
      x: geo.x,
      y: geo.y,
      w: geo.w,
      h: geo.h,
      shape: geo.shape,
      rotation: geo.rotation,
    };
  });
}

// BRIDGE tables reelles -> editeur : construit les tables vues par le canvas de
// l'editeur (label/couverts = table back ; geometrie = plan si presente, repli
// auto-grille sinon).
export function buildEditorTables(
  tables: readonly FloorTable[],
  geometry: GeometryMap,
): EditorTable[] {
  return layoutTables(tables, geometry).map((p) => ({
    id: p.table.id,
    label: p.table.name,
    shape: p.shape,
    x: p.x,
    y: p.y,
    width: p.w,
    height: p.h,
    rotation: p.rotation,
    seats: p.table.capacity,
  }));
}
