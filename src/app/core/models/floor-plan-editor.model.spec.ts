import {
  FLOOR_PLAN_TEMPLATES,
  GRID_STEP,
  TABLE_PRESETS,
  TablePreset,
  defaultGeometryFor,
  geometryFromPreset,
  gridPosition,
  nextTableName,
  offsetGeometry,
  rowGeometries,
  seedMissingGeometry,
  snapToGrid,
  tableSizePx,
} from './floor-plan-editor.model';

function preset(key: string): TablePreset {
  const p = TABLE_PRESETS.find((x) => x.key === key);
  if (!p) {
    throw new Error(`preset ${key} introuvable`);
  }
  return p;
}

describe('tableSizePx (echelle unique, fix D2)', () => {
  it('un carre normalise (w == h) rend wPx == hPx sur un conteneur 16:10', () => {
    const { w, h } = tableSizePx(0.14, 0.14, 1600, 1000);
    expect(w).toBe(h);
    expect(w).toBeCloseTo(0.14 * 1000, 5); // echelle = petit cote.
  });

  it('un carre reste carre sur un conteneur portrait', () => {
    const { w, h } = tableSizePx(0.2, 0.2, 500, 900);
    expect(w).toBe(h);
    expect(w).toBeCloseTo(0.2 * 500, 5);
  });

  it('applique la taille minimale lisible', () => {
    const { w, h } = tableSizePx(0.01, 0.01, 800, 500, 32);
    expect(w).toBe(32);
    expect(h).toBe(32);
  });
});

describe('geometryFromPreset', () => {
  it('pose la geometrie du preset au centre par defaut', () => {
    const geo = geometryFromPreset(preset('round-2'));
    expect(geo.shape).toBe('round');
    expect(geo.x).toBe(0.5);
    expect(geo.y).toBe(0.5);
    expect(geo.w).toBeGreaterThan(0);
    expect(geo.rotation).toBe(0);
  });

  it('borne la position dans 0..1', () => {
    const geo = geometryFromPreset(preset('square-4'), { x: 5, y: -2 });
    expect(geo.x).toBe(1);
    expect(geo.y).toBe(0);
  });
});

describe('defaultGeometryFor (repli par capacite)', () => {
  it('derive la forme de la capacite', () => {
    expect(defaultGeometryFor(2).shape).toBe('round');
    expect(defaultGeometryFor(4).shape).toBe('square');
    expect(defaultGeometryFor(6).shape).toBe('rect');
    expect(defaultGeometryFor(8).shape).toBe('rect');
  });

  it('les rondes et carrees ont w == h', () => {
    expect(defaultGeometryFor(2).w).toBe(defaultGeometryFor(2).h);
    expect(defaultGeometryFor(4).w).toBe(defaultGeometryFor(4).h);
  });
});

describe('gridPosition', () => {
  it('centre une table unique', () => {
    expect(gridPosition(0, 1)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('reste dans 0..1 pour toutes les positions', () => {
    for (let i = 0; i < 7; i++) {
      const p = gridPosition(i, 7);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});

describe('seedMissingGeometry', () => {
  const tables = [
    { id: 'a', capacity: 2 },
    { id: 'b', capacity: 4 },
    { id: 'c', capacity: 6 },
  ];

  it('complete uniquement les tables sans entree', () => {
    const existing = {
      b: { x: 0.1, y: 0.1, w: 0.14, h: 0.14, rotation: 0, shape: 'square' as const },
    };
    const added = seedMissingGeometry(tables, existing);
    expect(Object.keys(added).sort()).toEqual(['a', 'c']);
    // L'entree existante n'est pas touchee.
    expect(added['b']).toBeUndefined();
  });

  it('ne renvoie rien quand tout est deja geometrie', () => {
    const existing = Object.fromEntries(tables.map((t) => [t.id, defaultGeometryFor(t.capacity)]));
    expect(Object.keys(seedMissingGeometry(tables, existing)).length).toBe(0);
  });
});

describe('nextTableName', () => {
  it('reprend le plus petit entier libre apres suppression', () => {
    expect(nextTableName(['T1', 'T3'])).toBe('T2');
  });

  it('demarre a T1 sans tables', () => {
    expect(nextTableName([])).toBe('T1');
  });

  it('ignore les noms non conformes Tn', () => {
    expect(nextTableName(['Bar', 'Terrasse 1', 'T1'])).toBe('T2');
  });
});

describe('rowGeometries', () => {
  it('pose N geometries alignees (meme y, x croissant)', () => {
    const row = rowGeometries(preset('square-4'), 4, 0.4);
    expect(row.length).toBe(4);
    for (const g of row) {
      expect(g.y).toBe(0.4);
    }
    for (let i = 1; i < row.length; i++) {
      expect(row[i].x).toBeGreaterThan(row[i - 1].x);
    }
  });

  it('au moins une geometrie meme si count < 1', () => {
    expect(rowGeometries(preset('round-2'), 0).length).toBe(1);
  });

  it('garde toutes les coordonnees dans 0..1', () => {
    const row = rowGeometries(preset('rect-8'), 6);
    for (const g of row) {
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x).toBeLessThanOrEqual(1);
    }
  });
});

describe('offsetGeometry', () => {
  it('decale la copie en bornant dans 0..1', () => {
    const src = geometryFromPreset(preset('square-4'), { x: 0.98, y: 0.5 });
    const copy = offsetGeometry(src, 0.05);
    expect(copy.x).toBe(1);
    expect(copy.y).toBeCloseTo(0.55, 5);
    expect(copy.shape).toBe(src.shape);
  });
});

describe('snapToGrid', () => {
  it('aimante sur le pas de grille', () => {
    expect(snapToGrid(0.011, 0.025)).toBe(0); // arrondi au plus proche multiple.
    expect(snapToGrid(0.02, 0.025)).toBeCloseTo(0.025, 5);
    expect(snapToGrid(0.49, GRID_STEP)).toBeCloseTo(0.5, 5);
  });
});

describe('FLOOR_PLAN_TEMPLATES (appliques aux tables EXISTANTES)', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `id-${i + 1}`);

  it('un template ne cree rien : il ne pose de geometrie QUE sur les ids fournis', () => {
    for (const tpl of FLOOR_PLAN_TEMPLATES) {
      const geometry = tpl.apply(ids);
      for (const key of Object.keys(geometry)) {
        expect(ids).toContain(key);
      }
    }
  });

  it('Bistrot dispose les 12 premieres tables en rondes', () => {
    const geometry = FLOOR_PLAN_TEMPLATES.find((t) => t.key === 'bistrot')!.apply(ids);
    expect(Object.keys(geometry).length).toBe(12);
    expect(Object.values(geometry).every((g) => g.shape === 'round')).toBe(true);
    // Les 12 PREMIERES tables recoivent la geometrie.
    expect(geometry['id-1']).toBeTruthy();
    expect(geometry['id-13']).toBeUndefined();
  });

  it('s adapte quand il y a moins de tables que d emplacements', () => {
    const geometry = FLOOR_PLAN_TEMPLATES.find((t) => t.key === 'rows')!.apply(['a', 'b']);
    expect(Object.keys(geometry).sort()).toEqual(['a', 'b']);
  });

  it('Brasserie pose un bar et 8 emplacements mixtes', () => {
    const geometry = FLOOR_PLAN_TEMPLATES.find((t) => t.key === 'brasserie')!.apply(ids);
    expect(Object.keys(geometry).length).toBe(9);
    expect(Object.values(geometry).some((g) => g.shape === 'bar')).toBe(true);
  });

  it('Grille automatique ne pose aucune geometrie (repli auto-grille)', () => {
    const geometry = FLOOR_PLAN_TEMPLATES.find((t) => t.key === 'blank')!.apply(ids);
    expect(Object.keys(geometry).length).toBe(0);
  });

  it('chaque emplacement a des coordonnees normalisees', () => {
    for (const tpl of FLOOR_PLAN_TEMPLATES) {
      for (const g of Object.values(tpl.apply(ids))) {
        expect(g.x).toBeGreaterThanOrEqual(0);
        expect(g.x).toBeLessThanOrEqual(1);
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.y).toBeLessThanOrEqual(1);
      }
    }
  });
});
