import { estimateCapacity, parsePascalScene } from './pascal-import.model';

// Fixture fidele au format de scene Pascal (schemas Zod de @pascal-app/core) :
// salle 10 m x 8 m (4 murs), 3 tables, 1 bar, 2 chaises, 1 plante, 1 etagere
// MURALE (wallId -> exclue) et 1 table pivotee de 90 degres.
function makeScene(): string {
  const node = (id: string, extra: object): [string, object] => [
    id,
    { object: 'node', id, parentId: 'level_1', visible: true, metadata: {}, ...extra },
  ];
  const item = (
    id: string,
    name: string,
    pos: [number, number, number],
    dims: [number, number, number],
    extra: object = {},
  ): [string, object] =>
    node(id, {
      type: 'item',
      position: pos,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      asset: { name, dimensions: dims, category: 'furniture' },
      ...extra,
    });
  const wall = (id: string, start: [number, number], end: [number, number]): [string, object] =>
    node(id, { type: 'wall', start, end, thickness: 0.2, height: 2.8 });

  const nodes = Object.fromEntries([
    node('level_1', { type: 'level', level: 0 }),
    wall('wall_n', [0, 0], [10, 0]),
    wall('wall_e', [10, 0], [10, 8]),
    wall('wall_s', [10, 8], [0, 8]),
    wall('wall_w', [0, 8], [0, 0]),
    item('item_t1', 'Dining Table', [2, 0, 2], [1.6, 0.75, 0.9]),
    item('item_t2', 'Round Dining Table', [7, 0, 2], [1.2, 0.75, 1.2]),
    item('item_t3', 'Table', [5, 0, 6], [0.8, 0.75, 0.8]),
    item('item_bar', 'Bar Counter', [5, 0, 0.8], [3, 1.1, 0.6]),
    item('item_c1', 'Chair', [2, 0, 3], [0.45, 0.9, 0.45]),
    item('item_c2', 'Chair', [2.8, 0, 3], [0.45, 0.9, 0.45]),
    item('item_p1', 'Plant', [9.5, 0, 7.5], [0.4, 1.2, 0.4]),
    item('item_shelf', 'Shelf', [0, 1.5, 3], [1.2, 0.3, 0.3], { wallId: 'wall_w' }),
    item('item_rot', 'Dining Table', [8, 0, 6], [1.6, 0.75, 0.9], {
      rotation: [0, Math.PI / 2, 0],
    }),
  ]);
  return JSON.stringify({ nodes, rootNodeIds: ['level_1'] });
}

describe('parsePascalScene', () => {
  it('parse une scene valide et compte items, tables et murs', () => {
    const r = parsePascalScene(makeScene());
    expect(r.ok).toBe(true);
    // 8 items poses au sol : 3 tables + bar + 2 chaises + plante + table pivotee
    // (l'etagere murale est exclue).
    expect(r.itemCount).toBe(8);
    // 3 tables + 1 bar + la table pivotee = 5 pre-cochees.
    expect(r.tableCount).toBe(5);
    expect(r.wallCount).toBe(4);
  });

  it('exclut les items heberges sur un mur (coordonnees locales au mur)', () => {
    const r = parsePascalScene(makeScene());
    expect(r.candidates.some((c) => c.key === 'item_shelf')).toBe(false);
  });

  // Pascal donne une emprise DEJA orientee : pour une table pivotee d'un quart
  // de tour, il faut lui rendre ses dimensions locales, sinon la rotation est
  // appliquee deux fois et la table se retrouve en travers (elle rentrait dans
  // les murs sur un plan reel).
  it('une table pivotee garde son emprise au sol apres projection', () => {
    const r = parsePascalScene(makeScene());
    const droite = r.candidates.find((c) => c.key === 'item_t1')!;
    const pivotee = r.candidates.find((c) => c.key === 'item_rot')!;
    // Meme meuble (1.6 x 0.9 m), l'un pivote : l'encombrement AU SOL annonce est
    // le meme, c'est ce qu'on mesurerait au metre dans la salle.
    expect(pivotee.widthM).toBeCloseTo(droite.widthM, 6);
    expect(pivotee.depthM).toBeCloseTo(droite.depthM, 6);
    // Mais la geometrie de rendu, elle, est bien pivotee (cotes echanges).
    expect(pivotee.w).toBeCloseTo(droite.h, 6);
    expect(pivotee.h).toBeCloseTo(droite.w, 6);
    // Et donc la meme capacite estimee : le perimetre n'a pas change.
    expect(pivotee.capacity).toBe(droite.capacity);
  });

  it('ne pre-coche pas les chaises ni les plantes', () => {
    const r = parsePascalScene(makeScene());
    const others = r.candidates.filter((c) => !c.isTable).map((c) => c.label);
    expect(others).toContain('Chair');
    expect(others).toContain('Plant');
  });

  // Un plan exporte compte 3 a 4 assises par table : si une seule variante de nom
  // passe au travers, l'import se remplit de fausses tables.
  it('ne pre-coche aucune variante d assise', () => {
    for (const name of ['Dining Chair', 'Chaise', 'Bar Stool', 'Tabouret haut', 'Outdoor Seat']) {
      const scene = JSON.stringify({
        nodes: {
          level_1: { id: 'level_1', type: 'level', level: 0 },
          item_x: {
            id: 'item_x',
            type: 'item',
            position: [2, 0, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            asset: { name, dimensions: [0.45, 0.9, 0.45], category: 'furniture' },
          },
        },
        rootNodeIds: ['level_1'],
      });
      const r = parsePascalScene(scene);
      expect(r.candidates.find((c) => c.key === 'item_x')?.isTable, name).toBe(false);
    }
  });

  // A l'inverse : « banquette » et « bench » nomment de VRAIES tables en salle,
  // les exclure ferait rater des tables a l'import.
  it('pre-coche les tables banquette et bench', () => {
    for (const name of ['Table banquette', 'Bench Table', 'Banquette dining table']) {
      const scene = JSON.stringify({
        nodes: {
          level_1: { id: 'level_1', type: 'level', level: 0 },
          item_x: {
            id: 'item_x',
            type: 'item',
            position: [2, 0, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            asset: { name, dimensions: [1.6, 0.75, 0.9], category: 'furniture' },
          },
        },
        rootNodeIds: ['level_1'],
      });
      const r = parsePascalScene(scene);
      expect(r.candidates.find((c) => c.key === 'item_x')?.isTable, name).toBe(true);
    }
  });

  it('projette toutes les positions dans le repere normalise 0..1', () => {
    const r = parsePascalScene(makeScene());
    for (const c of r.candidates) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(1);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(1);
    }
    for (const w of r.walls) {
      expect(w.x1).toBeGreaterThanOrEqual(0);
      expect(w.x2).toBeLessThanOrEqual(1);
    }
  });

  it('conserve les proportions (une table carree reste carree)', () => {
    const r = parsePascalScene(makeScene());
    const square = r.candidates.find((c) => c.key === 'item_t3')!;
    // Tailles en fraction du petit cote : w et h partagent la MEME echelle.
    expect(square.w).toBeCloseTo(square.h, 5);
    expect(square.shape).toBe('square');
  });

  it('detecte la forme ronde par le nom et le bar par le ratio/nom', () => {
    const r = parsePascalScene(makeScene());
    expect(r.candidates.find((c) => c.key === 'item_t2')!.shape).toBe('round');
    expect(r.candidates.find((c) => c.key === 'item_bar')!.shape).toBe('bar');
  });

  it('convertit le yaw radians (sens trigo) en degres Konva (sens horaire)', () => {
    const r = parsePascalScene(makeScene());
    expect(r.candidates.find((c) => c.key === 'item_rot')!.rotation).toBe(270);
    expect(r.candidates.find((c) => c.key === 'item_t1')!.rotation).toBe(0);
  });

  it('estime des couverts credibles (rect 1,6x0,9 -> 6 ; carre 0,8 -> 4)', () => {
    const r = parsePascalScene(makeScene());
    expect(r.candidates.find((c) => c.key === 'item_t1')!.capacity).toBe(6);
    expect(r.candidates.find((c) => c.key === 'item_t3')!.capacity).toBe(4);
  });

  it('expose l’empreinte reelle en metres pour l’apercu', () => {
    const r = parsePascalScene(makeScene());
    const t1 = r.candidates.find((c) => c.key === 'item_t1')!;
    expect(t1.widthM).toBe(1.6);
    expect(t1.depthM).toBe(0.9);
  });

  it('accepte l’enveloppe { graph: { nodes } } (format API Pascal)', () => {
    const inner = JSON.parse(makeScene());
    const r = parsePascalScene(JSON.stringify({ graph: inner }));
    expect(r.ok).toBe(true);
    expect(r.wallCount).toBe(4);
  });

  it('un meuble HORS de l emprise des murs reste projete dans [0,1]', () => {
    const scene = JSON.parse(makeScene()) as { nodes: Record<string, object> };
    // Table posee a 3 m a l'exterieur du mur est (x = 15 > 12).
    scene.nodes['item_out'] = {
      object: 'node',
      id: 'item_out',
      type: 'item',
      parentId: 'level_1',
      position: [15, 0, 4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      asset: { name: 'Dining Table', dimensions: [1.2, 0.75, 0.8] },
      metadata: {},
    };
    const r = parsePascalScene(JSON.stringify(scene));
    const out = r.candidates.find((c) => c.key === 'item_out')!;
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.x).toBeLessThanOrEqual(1);
  });

  it('rejette un JSON invalide avec un message utilisateur', () => {
    const r = parsePascalScene('pas du json {');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('JSON');
  });

  it('rejette un JSON sans champ nodes', () => {
    const r = parsePascalScene(JSON.stringify({ foo: 1 }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('nodes');
  });

  it('rejette une scene sans meuble ni mur exploitable', () => {
    const r = parsePascalScene(JSON.stringify({ nodes: { a: { type: 'level' } } }));
    expect(r.ok).toBe(false);
  });
});

describe('estimateCapacity', () => {
  it('borne toujours le resultat entre 2 et 20', () => {
    expect(estimateCapacity(0.4, 0.4, 'square')).toBe(2);
    expect(estimateCapacity(15, 3, 'rect')).toBe(20);
  });

  it('compte un seul cote assis pour un bar', () => {
    expect(estimateCapacity(3, 0.6, 'bar')).toBe(5);
  });

  it('estime une ronde par sa circonference', () => {
    // d = 1,2 m -> perimetre ~3,77 m / 0,7 -> 5 couverts.
    expect(estimateCapacity(1.2, 1.2, 'round')).toBe(5);
  });
});
