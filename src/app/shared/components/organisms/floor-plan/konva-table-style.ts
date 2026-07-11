import type Konva from 'konva';

// Style partage des tables Konva (vue service + editeur) : sieges dessines
// autour des tables et ombre douce. C'est ce qui donne l'aspect « vrai logiciel
// de plan de salle » (les outils du marche dessinent les chaises).

type KonvaModule = typeof Konva;

// Nombre max de sieges dessines = la borne du champ Couverts de l'editeur (20).
// On dessine TOUJOURS autant de sieges que de couverts : deux tables de
// capacites differentes ne peuvent jamais avoir le meme rendu (coherence UX).
const MAX_SEATS = 20;
// Distance entre le bord de la table et le centre d'un siege.
const SEAT_GAP = 7;
// Rayon d'un siege, reduit quand il y en a beaucoup (ca reste lisible et propre).
export function seatRadius(count: number): number {
  if (count <= 8) {
    return 3.5;
  }
  return count <= 12 ? 3 : 2.5;
}

// Ombre douce et moderne sous la table.
export function applyTableShadow(shape: Konva.Shape): void {
  shape.shadowColor('#000000');
  shape.shadowOpacity(0.08);
  shape.shadowBlur(10);
  shape.shadowOffset({ x: 0, y: 3 });
}

// Accentue l'ombre au survol (retour a l'etat normal avec resetTableShadow).
export function hoverTableShadow(shape: Konva.Shape, hovered: boolean): void {
  shape.shadowOpacity(hovered ? 0.18 : 0.08);
  shape.shadowBlur(hovered ? 14 : 10);
}

// Sieges du groupe : liste des CHAISES (rectangles arrondis nommes 'seat').
function seatShapes(seats: Konva.Group): Konva.Rect[] {
  return seats.getChildren().filter((c): c is Konva.Rect => c.name() === 'seat');
}

// Ajuste le NOMBRE de chaises du groupe (persistant, pas de recreation quand le
// nombre ne change pas). Les positions sont posees par layoutSeats().
// Une chaise = petit rectangle arrondi ORIENTE vers la table (meme langage
// visuel que la vue 3D), bien plus « vrai plan de salle » qu'un point.
export function syncSeatCount(k: KonvaModule, seats: Konva.Group, capacity: number): void {
  const wanted = Math.max(0, Math.min(capacity, MAX_SEATS));
  for (let i = seatShapes(seats).length; i < wanted; i++) {
    seats.add(new k.Rect({ name: 'seat', listening: false }));
  }
  let extra = seatShapes(seats).length - wanted;
  while (extra > 0) {
    const all = seatShapes(seats);
    all[all.length - 1].destroy();
    extra--;
  }
  // Taille adaptee au nombre (beaucoup de chaises = plus petites). La chaise est
  // plus LARGE (parallele au bord de table) que profonde.
  const r = seatRadius(wanted);
  for (const seat of seatShapes(seats)) {
    const w = r * 2.6;
    const h = r * 1.8;
    seat.size({ width: w, height: h });
    seat.offset({ x: w / 2, y: h / 2 });
    seat.cornerRadius(r * 0.9);
  }

  // Marqueur de SATURATION : capacite au-dela du nombre de sieges dessines
  // (donnee creee hors editeur) -> badge « + » (pastille pleine, lisible) pour
  // que la jauge ne mente jamais.
  let plus = seats.findOne<Konva.Group>('.overflow') ?? null;
  if (capacity > MAX_SEATS) {
    if (!plus) {
      plus = new k.Group({ name: 'overflow', listening: false });
      plus.add(new k.Circle({ radius: 6.5 }));
      const txt = new k.Text({ text: '+', fontSize: 12, fontStyle: 'bold', fill: '#ffffff' });
      txt.offset({ x: txt.width() / 2, y: txt.height() / 2 - 0.5 });
      plus.add(txt);
      seats.add(plus);
    }
  } else {
    plus?.destroy();
  }
}

// Couleur des sieges (suit le statut de la table). Le badge « + » de saturation
// prend la meme couleur, mais PLEINE (il doit se voir, lui).
export function styleSeats(seats: Konva.Group, fill: string, opacity = 0.55): void {
  for (const seat of seats.getChildren()) {
    if (seat.getClassName() === 'Group') {
      // Badge overflow : cercle colore plein, texte blanc (fixe a la creation).
      const circle = (seat as Konva.Group).findOne<Konva.Circle>('Circle');
      circle?.fill(fill);
      seat.opacity(1);
      continue;
    }
    (seat as Konva.Shape).fill(fill);
    seat.opacity(opacity);
  }
}

// Positionne et ORIENTE les chaises autour de la forme (origine du groupe =
// CENTRE de la table).
//  - ronde : reparties sur le cercle, chaque chaise tangente (face a la table) ;
//  - rect  : bords haut/bas (+ bouts de table pour les grandes tablees).
export function layoutSeats(seats: Konva.Group, isRound: boolean, wPx: number, hPx: number): void {
  const children = seats.getChildren().filter((c) => c.name() === 'seat');
  const n = children.length;

  // Badge « + » de saturation : juste a l'exterieur du coin haut-droit (le groupe
  // sieges est DERRIERE le plateau, un badge sur le coin serait a moitie masque).
  const plus = seats.findOne<Konva.Group>('.overflow');
  if (plus) {
    const d = (isRound ? Math.SQRT1_2 * (wPx / 2) : Math.hypot(wPx, hPx) / 2) + 8;
    const angle = isRound ? Math.PI / 4 : Math.atan2(hPx, wPx);
    plus.position({
      x: isRound ? Math.cos(angle) * d : wPx / 2 + 5,
      y: isRound ? -Math.sin(angle) * d : -hPx / 2 - 5,
    });
  }

  if (n === 0) {
    return;
  }

  if (isRound) {
    const r = wPx / 2 + SEAT_GAP;
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      children[i].position({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      // Chaise tangente au cercle : elle « regarde » le centre de la table.
      children[i].rotation((angle * 180) / Math.PI + 90);
    }
    return;
  }

  // Grandes tablees : 2 sieges en bouts de table (comme un banquet), le reste
  // reparti sur les bords haut/bas — ca respire au lieu de s'entasser.
  const ends = n >= 10 ? 2 : 0;
  const remaining = n - ends;
  const top = Math.ceil(remaining / 2);
  const bottom = remaining - top;
  const spreadOn = (count: number, y: number, offset: number): void => {
    // Chaises reparties sur ~85 % de la largeur, centrees, face a la table.
    const span = wPx * 0.85;
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -span / 2 + (i * span) / (count - 1);
      children[offset + i].position({ x, y });
      children[offset + i].rotation(0);
    }
  };
  spreadOn(top, -hPx / 2 - SEAT_GAP, 0);
  spreadOn(bottom, hPx / 2 + SEAT_GAP, top);
  if (ends === 2) {
    children[n - 2].position({ x: -wPx / 2 - SEAT_GAP, y: 0 });
    children[n - 2].rotation(90);
    children[n - 1].position({ x: wPx / 2 + SEAT_GAP, y: 0 });
    children[n - 1].rotation(90);
  }
}

// ASSIETTES d'une table INSTALLEE : un petit couvert blanc devant chaque chaise,
// pose sur le plateau (la salle « vit », meme signal que la vue 3D). Recree a
// chaque layout : quelques cercles, negligeable.
export function layoutPlates(k: KonvaModule, plates: Konva.Group, seats: Konva.Group): void {
  plates.destroyChildren();
  for (const seat of seats.getChildren()) {
    if (seat.name() !== 'seat') {
      continue;
    }
    const pos = seat.position();
    const len = Math.hypot(pos.x, pos.y);
    if (len < 1) {
      continue;
    }
    // Assiette tiree vers le centre : depuis la chaise, on rentre dans le plateau.
    const d = Math.max(4, len - SEAT_GAP - 10);
    plates.add(
      new k.Circle({
        x: (pos.x * d) / len,
        y: (pos.y * d) / len,
        radius: 3.4,
        fill: '#ffffff',
        stroke: '#d9d5cc',
        strokeWidth: 1,
        listening: false,
      }),
    );
  }
}
