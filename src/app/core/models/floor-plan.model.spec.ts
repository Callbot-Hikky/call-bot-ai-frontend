import { Reservation, ReservationStatus } from './reservation.model';
import { FloorTable } from './table.model';
import { GeometryMap } from './floor-plan-editor.model';
import {
  FloorTableStatus,
  FloorTableView,
  autoGridLayout,
  bestFitTableId,
  blockedSides,
  buildEditorTables,
  deriveTableStatus,
  canMerge,
  eveningLoad,
  layoutTables,
  mergeViews,
  planAutoPlacements,
  EDITOR_MIN_GAP,
  WALL_MIN_GAP,
  pushApart,
  rotatedBox,
  wallObstacles,
  reservationLateMinutes,
  simulationRange,
  suggestMergeGroup,
  summarizeRoom,
  tableTimeLabel,
  tablesTouch,
} from './floor-plan.model';
import { formatTime } from '@core/utils/format';

function reservation(
  id: string,
  status: ReservationStatus,
  tableId: string | null,
  dateTime = '2026-06-22T20:00:00+02:00',
): Reservation {
  return {
    id,
    customerName: `Client ${id}`,
    phone: '+33 6 00 00 00 00',
    dateTime,
    partySize: 2,
    table: tableId ? { id: tableId, name: tableId.toUpperCase(), capacity: 2 } : undefined,
    status,
    source: 'manual',
  };
}

// DERIVATION TEMPORELLE : statut fonction des reservations ET de l'heure courante
// (`now` fixe en parametre = tests deterministes). Fenetre active d'une resa
// confirmed/pending : [dateTime − 45 min, dateTime + 120 min].
describe('deriveTableStatus', () => {
  const NOW = new Date('2026-06-22T20:00:00+02:00');

  it('table sans reservation -> Libre simple', () => {
    const result = deriveTableStatus('t1', [], NOW);
    expect(result.status).toBe('libre');
    expect(result.reservation).toBeNull();
    expect(result.nextTime).toBeNull();
    expect(result.nextDateTime).toBeNull();
    expect(result.lateMinutes).toBeNull();
  });

  it('reservation seated -> Installee (quelle que soit son heure)', () => {
    const result = deriveTableStatus(
      't1',
      [reservation('r1', 'seated', 't1', '2026-06-22T19:30:00+02:00')],
      NOW,
    );
    expect(result.status).toBe('installee');
    expect(result.reservation?.id).toBe('r1');
    expect(result.lateMinutes).toBeNull();
  });

  it('confirmed ACTIVE (dans les 45 min avant) -> Reservee, sans retard', () => {
    // Resa a 20:30, now 20:00 : dans la fenetre [19:45, 22:30].
    const result = deriveTableStatus(
      't1',
      [reservation('r1', 'confirmed', 't1', '2026-06-22T20:30:00+02:00')],
      NOW,
    );
    expect(result.status).toBe('reservee');
    expect(result.reservation?.id).toBe('r1');
    expect(result.lateMinutes).toBeNull();
    expect(result.nextTime).toBeNull();
  });

  it('pending ACTIVE -> Reservee', () => {
    const result = deriveTableStatus(
      't1',
      [reservation('r1', 'pending', 't1', '2026-06-22T20:00:00+02:00')],
      NOW,
    );
    expect(result.status).toBe('reservee');
  });

  it('active depassee de plus de 15 min -> Reservee avec lateMinutes (arrondi)', () => {
    // Resa a 19:35, now 20:00 : 25 min de retard sans installation.
    const result = deriveTableStatus(
      't1',
      [reservation('r1', 'confirmed', 't1', '2026-06-22T19:35:00+02:00')],
      NOW,
    );
    expect(result.status).toBe('reservee');
    expect(result.lateMinutes).toBe(25);
  });

  it('depassee de 15 min pile -> pas encore en retard (seuil strict)', () => {
    const result = deriveTableStatus(
      't1',
      [reservation('r1', 'confirmed', 't1', '2026-06-22T19:45:00+02:00')],
      NOW,
    );
    expect(result.status).toBe('reservee');
    expect(result.lateMinutes).toBeNull();
  });

  it('deux actives -> affiche la plus proche de now', () => {
    // 19:30 (30 min ecoulees) vs 20:15 (dans 15 min) : la plus proche est 20:15.
    const result = deriveTableStatus(
      't1',
      [
        reservation('past', 'confirmed', 't1', '2026-06-22T19:30:00+02:00'),
        reservation('next', 'confirmed', 't1', '2026-06-22T20:15:00+02:00'),
      ],
      NOW,
    );
    expect(result.status).toBe('reservee');
    expect(result.reservation?.id).toBe('next');
  });

  it('resa PLUS TARD (hors fenetre) -> Libre avec nextTime de la plus proche', () => {
    // 21:30 : fenetre ouvre a 20:45 > now -> table encore libre, info « → 21:30 ».
    const later = reservation('r1', 'confirmed', 't1', '2026-06-22T21:30:00+02:00');
    const result = deriveTableStatus(
      't1',
      [later, reservation('r2', 'confirmed', 't1', '2026-06-22T22:00:00+02:00')],
      NOW,
    );
    expect(result.status).toBe('libre');
    expect(result.reservation).toBeNull();
    expect(result.nextTime).toBe(formatTime(later.dateTime));
    expect(result.nextDateTime).toBe(later.dateTime);
  });

  it('resa depassee de plus de 120 min sans installation -> la table redevient Libre', () => {
    // 17:30, now 20:00 : fenetre [16:45, 19:30] fermee. La resa reste en liste,
    // au staff de l'annuler ; la table est re-vendable.
    const result = deriveTableStatus(
      't1',
      [reservation('r1', 'confirmed', 't1', '2026-06-22T17:30:00+02:00')],
      NOW,
    );
    expect(result.status).toBe('libre');
    expect(result.nextTime).toBeNull();
    expect(result.lateMinutes).toBeNull();
  });

  it('completed / cancelled / no_show -> Libre (non actif)', () => {
    for (const status of ['completed', 'cancelled', 'no_show'] as ReservationStatus[]) {
      const result = deriveTableStatus(
        't1',
        [reservation('r1', status, 't1', '2026-06-22T20:00:00+02:00')],
        NOW,
      );
      expect(result.status).toBe('libre');
      expect(result.reservation).toBeNull();
    }
  });

  it('seated prioritaire sur confirmed pour la meme table', () => {
    const result = deriveTableStatus(
      't1',
      [
        reservation('r1', 'confirmed', 't1', '2026-06-22T20:00:00+02:00'),
        reservation('r2', 'seated', 't1', '2026-06-22T20:00:00+02:00'),
      ],
      NOW,
    );
    expect(result.status).toBe('installee');
    expect(result.reservation?.id).toBe('r2');
  });

  it('ignore les reservations des autres tables', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'seated', 't2')], NOW);
    expect(result.status).toBe('libre');
  });
});

describe('autoGridLayout', () => {
  const tables: FloorTable[] = Array.from({ length: 7 }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    capacity: 2,
    isActive: true,
  }));

  it('place chaque table avec des coordonnees normalisees 0..1', () => {
    const placed = autoGridLayout(tables);
    expect(placed.length).toBe(7);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('retourne une liste vide sans tables', () => {
    expect(autoGridLayout([])).toEqual([]);
  });

  it('conserve l ordre et la reference des tables', () => {
    const placed = autoGridLayout(tables);
    expect(placed.map((p) => p.table.id)).toEqual(tables.map((t) => t.id));
  });

  it('centre une table unique', () => {
    const placed = autoGridLayout([tables[0]]);
    expect(placed[0].x).toBe(0.5);
    expect(placed[0].y).toBe(0.5);
  });

  it('derive forme et taille de la capacite (repli)', () => {
    const placed = autoGridLayout([
      { id: 'r', name: 'R', capacity: 2, isActive: true },
      { id: 's', name: 'S', capacity: 4, isActive: true },
      { id: 'x', name: 'X', capacity: 8, isActive: true },
    ]);
    expect(placed[0].shape).toBe('round');
    expect(placed[1].shape).toBe('square');
    expect(placed[2].shape).toBe('rect');
    expect(placed.every((p) => p.w > 0 && p.h > 0 && p.rotation === 0)).toBe(true);
  });
});

// BRIDGE editeur -> vue service (LOT A) : la geometrie sauvegardee est keyee par
// l'id BACK de la table ; repli auto-grille pour les tables sans entree.
describe('layoutTables', () => {
  const tables: FloorTable[] = [
    { id: 't1', name: 'T1', capacity: 2, isActive: true },
    { id: 't2', name: 'T2', capacity: 4, isActive: true },
  ];
  const geometry: GeometryMap = {
    t1: { x: 0.21, y: 0.37, w: 0.2, h: 0.12, rotation: 45, shape: 'rect' },
  };

  it('utilise position + forme + rotation du plan quand la geometrie existe', () => {
    const placed = layoutTables(tables, geometry);
    const t1 = placed.find((p) => p.table.id === 't1')!;
    expect(t1.x).toBeCloseTo(0.21, 5);
    expect(t1.y).toBeCloseTo(0.37, 5);
    expect(t1.shape).toBe('rect');
    expect(t1.rotation).toBe(45);
    expect(t1.w).toBeCloseTo(0.2, 5);
  });

  it('repli auto-grille pour les tables sans geometrie', () => {
    const placed = layoutTables(tables, geometry);
    const fallback = autoGridLayout(tables).find((p) => p.table.id === 't2')!;
    const t2 = placed.find((p) => p.table.id === 't2')!;
    expect(t2.x).toBe(fallback.x);
    expect(t2.y).toBe(fallback.y);
    expect(t2.shape).toBe('square'); // capacite 4.
  });

  it('sans plan sauvegarde, equivaut a l auto-grille', () => {
    expect(layoutTables(tables, {})).toEqual(autoGridLayout(tables));
  });
});

// LOT B2 : meilleure table = libre, de capacite minimale suffisante.
describe('bestFitTableId', () => {
  function view(
    id: string,
    capacity: number,
    status: FloorTableStatus,
    res: Reservation | null = null,
  ): FloorTableView {
    return {
      table: { id, name: id.toUpperCase(), capacity, isActive: true },
      x: 0.5,
      y: 0.5,
      w: 0.1,
      h: 0.1,
      shape: 'square',
      rotation: 0,
      status,
      reservation: res,
      nextTime: null,
      nextDateTime: null,
      lateMinutes: null,
    };
  }

  it('retourne la table libre de capacite minimale suffisante', () => {
    const views = [view('t1', 2, 'libre'), view('t2', 8, 'libre'), view('t3', 4, 'libre')];
    expect(bestFitTableId(views, 3)).toBe('t3');
  });

  it('a egalite de capacite, retourne la premiere rencontree', () => {
    const views = [view('t1', 4, 'libre'), view('t2', 4, 'libre')];
    expect(bestFitTableId(views, 4)).toBe('t1');
  });

  it('ignore les tables occupees et les tables trop petites', () => {
    const views = [
      view('t1', 8, 'reservee', reservation('r1', 'confirmed', 't1')),
      view('t2', 2, 'libre'),
      view('t3', 6, 'libre'),
    ];
    expect(bestFitTableId(views, 4)).toBe('t3');
  });

  it('retourne null si aucune table libre ne suffit', () => {
    const views = [view('t1', 2, 'libre'), view('t2', 4, 'installee')];
    expect(bestFitTableId(views, 6)).toBeNull();
  });
});

// LOT B5 : heure affichee sur les tables reservees / installees, rien si libre.
// ALERTE RETARD : une reservee en retard complete l'heure avec « · +N min ».
describe('tableTimeLabel', () => {
  const res = reservation('r1', 'confirmed', 't1', '2026-06-22T20:00:00+02:00');

  it('table reservee -> heure de sa reservation', () => {
    const label = tableTimeLabel({ status: 'reservee', reservation: res, lateMinutes: null });
    expect(label).toBe(formatTime(res.dateTime));
    expect(label).not.toBe('');
  });

  it('table reservee en retard -> heure + retard', () => {
    const label = tableTimeLabel({ status: 'reservee', reservation: res, lateMinutes: 25 });
    expect(label).toBe(`${formatTime(res.dateTime)} · +25 min`);
  });

  it('table installee -> heure de sa reservation (sobre, sans prefixe)', () => {
    expect(tableTimeLabel({ status: 'installee', reservation: res, lateMinutes: null })).toBe(
      formatTime(res.dateTime),
    );
  });

  it('table libre -> aucun texte', () => {
    expect(tableTimeLabel({ status: 'libre', reservation: null, lateMinutes: null })).toBe('');
  });
});

describe('buildEditorTables', () => {
  it('nom et couverts viennent TOUJOURS de la table back', () => {
    const tables: FloorTable[] = [
      { id: 'uuid-1', name: 'Terrasse 2', capacity: 6, isActive: true },
    ];
    const geometry: GeometryMap = {
      'uuid-1': { x: 0.5, y: 0.5, w: 0.2, h: 0.12, rotation: 0, shape: 'rect' },
    };
    const editor = buildEditorTables(tables, geometry);
    expect(editor.length).toBe(1);
    expect(editor[0].id).toBe('uuid-1');
    expect(editor[0].label).toBe('Terrasse 2');
    expect(editor[0].seats).toBe(6);
    expect(editor[0].shape).toBe('rect');
  });
});

// MODE SERVICE : synthese de salle (bandeau « poste d'accueil »).
describe('deriveTableStatus (mode projete / simulation)', () => {
  const seatedAt20 = [reservation('r1', 'seated', 't1', '2026-06-22T20:00:00+02:00')];

  it('en LIVE, une table seated reste installee sans limite d heure', () => {
    const at23 = deriveTableStatus('t1', seatedAt20, new Date('2026-06-22T23:30:00+02:00'));
    expect(at23.status).toBe('installee');
  });

  it('en PROJECTION, une seated se libere apres la duree de service (+120 min)', () => {
    const during = deriveTableStatus('t1', seatedAt20, new Date('2026-06-22T21:30:00+02:00'), true);
    expect(during.status).toBe('installee');
    const after = deriveTableStatus('t1', seatedAt20, new Date('2026-06-22T22:15:00+02:00'), true);
    expect(after.status).toBe('libre');
  });

  it('en PROJECTION, aucune alerte retard (concept temps reel uniquement)', () => {
    const confirmed = [reservation('r1', 'confirmed', 't1', '2026-06-22T20:00:00+02:00')];
    const at2030 = new Date('2026-06-22T20:30:00+02:00');
    // En live : +30 min -> alerte retard.
    expect(deriveTableStatus('t1', confirmed, at2030).lateMinutes).toBe(30);
    // En projection : on suppose que le client arrivera -> pas de retard.
    const projected = deriveTableStatus('t1', confirmed, at2030, true);
    expect(projected.status).toBe('reservee');
    expect(projected.lateMinutes).toBeNull();
  });

  it('en PROJECTION, une seated liberee laisse la place a la resa suivante', () => {
    const withNext = [
      ...seatedAt20,
      reservation('r2', 'confirmed', 't1', '2026-06-22T22:30:00+02:00'),
    ];
    const at2215 = deriveTableStatus('t1', withNext, new Date('2026-06-22T22:15:00+02:00'), true);
    // 22:15 est dans la fenetre active de la resa de 22:30 (des 21:45).
    expect(at2215.status).toBe('reservee');
  });
});

describe('fusion de tables (mergeViews / canMerge)', () => {
  function view(
    id: string,
    x: number,
    y: number,
    status: FloorTableStatus = 'libre',
    capacity = 4,
  ): FloorTableView {
    return {
      table: { id, name: id.toUpperCase(), capacity },
      x,
      y,
      w: 0.14,
      h: 0.14,
      shape: 'square',
      rotation: 0,
      status,
      reservation: null,
      nextTime: null,
      nextDateTime: null,
      lateMinutes: null,
    } as FloorTableView;
  }

  it('canMerge : vrai pour des tables collees, faux pour des tables eloignees', () => {
    // Collees : 0.14 de large (petit cote), centres ecartes de 0.14 en X petit
    // cote -> x normalises ecartes de 0.14/1.6.
    const a = { x: 0.5, y: 0.5, w: 0.14, h: 0.14 };
    const b = { x: 0.5 + 0.14 / 1.6, y: 0.5, w: 0.14, h: 0.14 };
    const far = { x: 0.9, y: 0.9, w: 0.14, h: 0.14 };
    expect(canMerge([a, b])).toBe(true);
    expect(canMerge([a, far])).toBe(false);
    expect(canMerge([a])).toBe(false);
  });

  it('fusionne deux tables en UNE tablee : ancre, nom combine, couverts sommes', () => {
    const a = view('t1', 0.5, 0.5, 'libre', 4);
    const b = view('t2', 0.5 + 0.14 / 1.6, 0.5, 'libre', 6);
    const merged = mergeViews([a, b], [['t1', 't2']]);
    expect(merged.length).toBe(1);
    const block = merged[0];
    // L'ancre garde l'id de la premiere table (walk-in/affectation intacts).
    expect(block.table.id).toBe('t1');
    expect(block.table.name).toBe('T1+T2');
    expect(block.table.capacity).toBe(10);
    // Bloc englobant : plus large qu'une table seule.
    expect(block.w).toBeGreaterThan(0.25);
  });

  it('le statut le plus occupe domine la tablee', () => {
    const a = view('t1', 0.5, 0.5, 'libre');
    const b = view('t2', 0.55, 0.5, 'installee');
    const merged = mergeViews([a, b], [['t1', 't2']]);
    expect(merged[0].status).toBe('installee');
  });

  it('identite de la tablee : le DOMINANT porte table.id (pas l ancre)', () => {
    // t1 (ancre, members[0]) libre, t2 occupe -> le bloc doit cibler t2 pour que
    // les actions agissent sur la table qui porte la resa affichee (fix #11).
    const a = view('t1', 0.5, 0.5, 'libre');
    const b = view('t2', 0.55, 0.5, 'installee');
    const merged = mergeViews([a, b], [['t1', 't2']]);
    expect(merged[0].table.id).toBe('t2');
    expect(merged[0].table.name).toBe('T1+T2');
  });

  it('tablee toute libre : l identite reste members[0] (walk-in stable)', () => {
    const a = view('t1', 0.5, 0.5, 'libre');
    const b = view('t2', 0.55, 0.5, 'libre');
    const merged = mergeViews([a, b], [['t1', 't2']]);
    expect(merged[0].table.id).toBe('t1');
  });

  it('ignore un groupe dont une table a disparu', () => {
    const a = view('t1', 0.5, 0.5);
    const merged = mergeViews([a], [['t1', 't-supprimee']]);
    expect(merged.length).toBe(1);
    expect(merged[0].table.name).toBe('T1');
  });

  it('sans groupe, les vues sont inchangees', () => {
    const a = view('t1', 0.2, 0.2);
    const b = view('t2', 0.8, 0.8);
    expect(mergeViews([a, b], []).length).toBe(2);
  });

  it('la prochaine resa de la tablee est la plus proche parmi TOUS les membres', () => {
    // t2 (non dominant, non ancre) porte la prochaine resa : le bloc doit
    // l'exposer pour que le garde-fou walk-in la voie.
    const a = view('t1', 0.5, 0.5);
    const b = {
      ...view('t2', 0.55, 0.5),
      nextTime: '21:00',
      nextDateTime: '2026-07-16T21:00:00',
    };
    const merged = mergeViews([a, b], [['t1', 't2']]);
    expect(merged[0].nextTime).toBe('21:00');
    expect(merged[0].nextDateTime).toBe('2026-07-16T21:00:00');
  });
});

describe('placement auto et fusion guidee (planAutoPlacements / suggestMergeGroup)', () => {
  function freeView(
    id: string,
    capacity: number,
    x = 0.5,
    y = 0.5,
    extra: Partial<FloorTableView> = {},
  ): FloorTableView {
    return {
      table: { id, name: id.toUpperCase(), capacity },
      x,
      y,
      w: 0.14,
      h: 0.14,
      shape: 'square',
      rotation: 0,
      status: 'libre',
      reservation: null,
      nextTime: null,
      nextDateTime: null,
      lateMinutes: null,
      ...extra,
    } as FloorTableView;
  }

  it('bestFitTableId ecarte une table dont la prochaine resa est trop proche', () => {
    // t1 libre mais reservee a 20h30 ; la resa a placer est a 20h -> conflit.
    const t1 = freeView('t1', 4, 0.2, 0.2, {
      nextTime: '20:30',
      nextDateTime: '2026-07-17T20:30:00',
    });
    const t2 = freeView('t2', 6, 0.8, 0.8);
    expect(bestFitTableId([t1, t2], 4, '2026-07-17T20:00:00')).toBe('t2');
    // Sans heure fournie : comportement historique (t1 gagne, plus petite).
    expect(bestFitTableId([t1, t2], 4)).toBe('t1');
  });

  it('planAutoPlacements place les grandes tablees d abord, une table par resa', () => {
    const views = [freeView('t1', 2, 0.2, 0.2), freeView('t2', 6, 0.8, 0.8)];
    const small = { ...reservation('r-small', 'confirmed', null), partySize: 2 };
    const big = { ...reservation('r-big', 'confirmed', null), partySize: 6 };
    const placements = planAutoPlacements(views, [small, big]);
    // La grande d'abord (sinon elle perdrait t2, sa seule option).
    expect(placements).toEqual([
      { reservationId: 'r-big', tableId: 't2' },
      { reservationId: 'r-small', tableId: 't1' },
    ]);
  });

  it('bestFitTableId ne recommande le BAR qu en dernier recours', () => {
    const bar = { ...freeView('bar', 6, 0.2, 0.2), shape: 'bar' as const };
    const table = freeView('t1', 8, 0.8, 0.8);
    // Une vraie table convient (meme plus grande) : elle gagne sur le bar.
    expect(bestFitTableId([bar, table], 6)).toBe('t1');
    // Aucune table assez grande : le bar reste propose.
    expect(bestFitTableId([bar, freeView('t2', 2, 0.8, 0.8)], 6)).toBe('bar');
  });

  it('planAutoPlacements laisse de cote les resas sans table suffisante', () => {
    const views = [freeView('t1', 2, 0.2, 0.2)];
    const big = { ...reservation('r-big', 'confirmed', null), partySize: 10 };
    expect(planAutoPlacements(views, [big])).toEqual([]);
  });

  it('suggestMergeGroup propose la paire VOISINE de capacite totale minimale', () => {
    const side = 0.14 / 1.6; // ecart en x normalise pour etre bord a bord
    const a = freeView('t1', 4, 0.5, 0.5);
    const b = freeView('t2', 4, 0.5 + side, 0.5);
    const c = freeView('t3', 12, 0.5 + 2 * side, 0.5); // voisine de b, plus grosse
    const group = suggestMergeGroup([a, b, c], 8);
    expect(group?.map((v) => v.table.id)).toEqual(['t1', 't2']); // 8 couv, pas 16
  });

  it('suggestMergeGroup ignore tables occupees, eloignees ou deja fusionnees', () => {
    const side = 0.14 / 1.6;
    const a = freeView('t1', 4, 0.5, 0.5);
    const busy = freeView('t2', 4, 0.5 + side, 0.5, { status: 'installee' });
    const far = freeView('t3', 4, 0.9, 0.9);
    expect(suggestMergeGroup([a, busy, far], 8)).toBeNull();
    // t1+t4 voisines mais t4 deja membre d'une tablee -> ecartee.
    const t4 = freeView('t4', 4, 0.5 + side, 0.5);
    expect(suggestMergeGroup([a, t4], 8, [['t4', 't9']])).toBeNull();
  });

  it('suggestMergeGroup etend a une chaine de 3 quand aucune paire ne suffit', () => {
    const side = 0.14 / 1.6;
    const a = freeView('t1', 4, 0.5, 0.5);
    const b = freeView('t2', 4, 0.5 + side, 0.5);
    const c = freeView('t3', 4, 0.5 + 2 * side, 0.5);
    const group = suggestMergeGroup([a, b, c], 10);
    expect(group?.length).toBe(3);
    expect(group?.reduce((s, v) => s + v.table.capacity, 0)).toBe(12);
  });
});

describe('eveningLoad (jauge de soiree)', () => {
  it('somme les couverts des resas vivantes, ignore les mortes', () => {
    const resas = [
      { ...reservation('r1', 'confirmed', null), partySize: 4 },
      { ...reservation('r2', 'seated', 't1'), partySize: 6 },
      { ...reservation('r3', 'pending', null), partySize: 2 },
      { ...reservation('r4', 'cancelled', null), partySize: 10 },
      { ...reservation('r5', 'no_show', null), partySize: 8 },
      { ...reservation('r6', 'completed', 't2'), partySize: 5 },
    ];
    const tables = [{ capacity: 4 }, { capacity: 20 }];
    expect(eveningLoad(resas, tables)).toEqual({ couverts: 12, capacity: 24, pct: 50 });
  });

  it('salle vide : pct 0 (pas de division par zero)', () => {
    expect(eveningLoad([], [])).toEqual({ couverts: 0, capacity: 0, pct: 0 });
  });
});

describe('blockedSides (cotes ou une table est collee)', () => {
  const side = 0.14 / 1.6; // ecart x normalise pour etre bord a bord (w=0.14)
  const at = (x: number, y: number) => ({ x, y, w: 0.14, h: 0.14 });

  it('detecte une voisine collee a droite et une au-dessus', () => {
    const table = at(0.5, 0.5);
    const right = at(0.5 + side, 0.5);
    const above = at(0.5, 0.5 - 0.14);
    expect(blockedSides(table, [right, above])).toEqual({
      n: true,
      s: false,
      e: true,
      w: false,
    });
  });

  it('une table eloignee ne bloque rien', () => {
    expect(blockedSides(at(0.5, 0.5), [at(0.9, 0.9)])).toEqual({
      n: false,
      s: false,
      e: false,
      w: false,
    });
  });

  it('l espacement d une rangee generee (0.02 de largeur) ne bloque PAS', () => {
    // rowGeometries espace les tables de 0.02 en fraction de largeur
    // (= 0.032 petit cote) : elles ne se touchent pas, chaises conservees.
    const rowGap = (0.14 + 0.02 * 1.6) / 1.6;
    expect(blockedSides(at(0.5, 0.5), [at(0.5 + rowGap, 0.5)]).e).toBe(false);
  });

  it('un contact coin a coin ne bloque aucun cote', () => {
    // Voisine en diagonale exacte : dx et dy ~0 mais aucun chevauchement franc.
    const diag = at(0.5 + side, 0.5 + 0.14);
    expect(blockedSides(at(0.5, 0.5), [diag])).toEqual({
      n: false,
      s: false,
      e: false,
      w: false,
    });
  });

  // Les tables pivotees sont desormais TRAITEES (et non plus ignorees) : le
  // contact est calcule sur l'emprise reelle, puis le cote bloque est reprojete
  // dans le repere local de la table, ou les chaises sont posees.
  it('table TOURNEE a 90 deg : bloque son cote local, pas le cote ecran', () => {
    const turned = { ...at(0.5, 0.5), rotation: 90 };
    const blocked = blockedSides(turned, [at(0.5 + side, 0.5)]);
    expect(blocked.n).toBe(true);
    expect(blocked.e).toBe(false);
  });

  it('VOISINE tournee : son contact est pris en compte (chaise masquee)', () => {
    const neighborTurned = { ...at(0.5 + side, 0.5), rotation: 90 };
    expect(blockedSides(at(0.5, 0.5), [neighborTurned]).e).toBe(true);
  });

  // Angle libre : on arrondit au quart de tour le plus proche. 45 deg est le pire
  // cas (ambigu par construction) ; on verifie seulement qu'un seul cote sort,
  // jamais plusieurs, pour ne pas effacer toutes les chaises d'un coup.
  it('angle non multiple de 90 : au plus un cote bloque', () => {
    const turned = { ...at(0.5, 0.5), rotation: 45 };
    const blocked = blockedSides(turned, [at(0.5 + side, 0.5)]);
    const count = [blocked.n, blocked.s, blocked.e, blocked.w].filter(Boolean).length;
    expect(count).toBeLessThanOrEqual(1);
  });
});

describe('pushApart (anti-chevauchement editeur)', () => {
  const at = (x: number, y: number) => ({ x, y, w: 0.14, h: 0.14 });

  const gapWith = (corrected: { x: number }) => Math.abs(corrected.x * 1.6 - 0.5 * 1.6) - 0.14;

  it('ecarte une table lachee sur une voisine (gap minimal respecte)', () => {
    const moved = at(0.52, 0.5); // chevauche la voisine a 0.5
    const corrected = pushApart(moved, [at(0.5, 0.5)]);
    expect(gapWith(corrected)).toBeGreaterThanOrEqual(EDITOR_MIN_GAP - 1e-9);
  });

  it('ne bouge pas une table deja assez eloignee', () => {
    const moved = at(0.8, 0.8);
    expect(pushApart(moved, [at(0.5, 0.5)])).toEqual({ x: 0.8, y: 0.8 });
  });

  // La table corrigee doit rester COLLEE : sous la tolerance de fusion, sinon on
  // ne peut plus faire une grande tablee en un clic apres avoir rapproche.
  it('laisse les tables assez proches pour rester fusionnables', () => {
    const corrected = pushApart(at(0.52, 0.5), [at(0.5, 0.5)]);
    expect(gapWith(corrected)).toBeLessThan(0.035);
  });

  // L'ecart est calibre sur les CHAISES : trop faible, elles se chevauchent tout
  // en restant dessinees (le masquage ne s'applique que sous BLOCK_GAP = 0.015).
  it('ecarte assez pour que les couronnes de chaises ne se recouvrent pas', () => {
    // ~10,5 px de portee de chaise de chaque cote, sur un petit cote de ~688 px.
    const porteeChaise = 10.5 / 688;
    expect(EDITOR_MIN_GAP).toBeGreaterThanOrEqual(porteeChaise * 2);
    // Mais toujours fusionnable en un clic.
    expect(EDITOR_MIN_GAP).toBeLessThan(0.035);
  });

  // Regression : une table coincee entre une voisine a gauche et une au-dessus
  // etait poussee en X *puis* en Y et partait en diagonale.
  it('degage sur un seul axe (pas de decalage en diagonale)', () => {
    const corrected = pushApart(at(0.5, 0.5), [at(0.44, 0.5), at(0.5, 0.44)]);
    const movedX = Math.abs(corrected.x - 0.5) > 1e-9;
    const movedY = Math.abs(corrected.y - 0.5) > 1e-9;
    expect(movedX && movedY).toBe(false);
  });

  // Regression (cas T1 / T7 / T3) : en se degageant d'une voisine, la table
  // venait en recouvrir une autre. Le degagement sur un seul axe est un confort
  // visuel ; il ne doit jamais laisser un chevauchement derriere lui.
  it('ne laisse aucun chevauchement, meme coincee entre plusieurs voisines', () => {
    const others = [at(0.42, 0.5), at(0.58, 0.5), at(0.5, 0.4)];
    const corrected = pushApart(at(0.5, 0.5), others);
    for (const o of others) {
      const dx = Math.abs(corrected.x * 1.6 - o.x * 1.6) - 0.14;
      const dy = Math.abs(corrected.y - o.y) - 0.14;
      expect(dx >= EDITOR_MIN_GAP - 1e-9 || dy >= EDITOR_MIN_GAP - 1e-9).toBe(true);
    }
  });
});

describe('rotatedBox (emprise reelle des tables pivotees)', () => {
  it('echange largeur et hauteur a 90 degres', () => {
    const box = rotatedBox({ x: 0.5, y: 0.5, w: 0.2, h: 0.1, rotation: 90 });
    expect(box.w).toBeCloseTo(0.1, 6);
    expect(box.h).toBeCloseTo(0.2, 6);
  });

  it('laisse une table non pivotee inchangee', () => {
    const box = rotatedBox({ x: 0.5, y: 0.5, w: 0.2, h: 0.1, rotation: 0 });
    expect(box.w).toBeCloseTo(0.2, 6);
    expect(box.h).toBeCloseTo(0.1, 6);
  });

  // Regression (cas T1 a 90 deg / T3 a 0 deg d'un plan importe) : sans tenir
  // compte de la rotation, l'emprise testee est fausse et les deux tables se
  // recouvrent malgre l'anti-chevauchement.
  it('empeche le recouvrement de deux tables d orientations differentes', () => {
    const t1 = rotatedBox({ x: 0.5, y: 0.5, w: 0.26, h: 0.12, rotation: 90 });
    const t3 = { x: 0.56, y: 0.42, w: 0.18, h: 0.12 };
    const corrected = pushApart(t1, [t3]);
    const dx = Math.abs(corrected.x * 1.6 - t3.x * 1.6) - (t1.w + t3.w) / 2;
    const dy = Math.abs(corrected.y - t3.y) - (t1.h + t3.h) / 2;
    expect(dx >= EDITOR_MIN_GAP - 1e-9 || dy >= EDITOR_MIN_GAP - 1e-9).toBe(true);
  });
});

describe('pushApart : la table reste DANS le plan', () => {
  // Regression (visible a l'import) : borner le centre a [0,1] laissait la
  // moitie d'une table depasser du cadre.
  it('ne laisse jamais une table depasser du bord', () => {
    const collee = { x: 0.99, y: 0.99, w: 0.2, h: 0.2 };
    const corrected = pushApart(collee, [{ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }]);
    const halfX = 0.2 / 2 / 1.6;
    expect(corrected.x).toBeLessThanOrEqual(1 - halfX + 1e-9);
    expect(corrected.x).toBeGreaterThanOrEqual(halfX - 1e-9);
    expect(corrected.y).toBeLessThanOrEqual(1 - 0.1 + 1e-9);
    expect(corrected.y).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('centre une table plus large que le plan au lieu de l inverser', () => {
    const enorme = { x: 0.9, y: 0.5, w: 4, h: 0.2 };
    expect(pushApart(enorme, []).x).toBe(0.5);
  });
});

describe('blockedSides avec tables pivotees', () => {
  // Table centrale + voisine COLLEE a sa droite (est de l'ecran).
  const centre = { x: 0.5, y: 0.5, w: 0.14, h: 0.14 };
  const voisineEst = { x: 0.5 + 0.14 / 1.6, y: 0.5, w: 0.14, h: 0.14 };

  it('table non pivotee : masque les chaises du cote du contact', () => {
    const b = blockedSides(centre, [voisineEst]);
    expect(b.e).toBe(true);
    expect(b.n || b.s || b.w).toBe(false);
  });

  // Le groupe Konva est tourne AVANT que les chaises soient posees : pour une
  // table a 90 deg, le voisin situe a l'est de l'ecran bloque son cote NORD
  // local. Masquer « est » masquerait les chaises du mauvais bord.
  it('table a 90 deg : le contact a l est de l ecran bloque le cote nord LOCAL', () => {
    const b = blockedSides({ ...centre, rotation: 90 }, [voisineEst]);
    expect(b.n).toBe(true);
    expect(b.e).toBe(false);
  });

  it('table a 180 deg : le contact est bloque le cote ouest local', () => {
    const b = blockedSides({ ...centre, rotation: 180 }, [voisineEst]);
    expect(b.w).toBe(true);
    expect(b.e).toBe(false);
  });

  // Regression : un voisin pivote etait purement ignore, donc une chaise etait
  // dessinee au milieu du plateau d'a cote.
  it('prend en compte un VOISIN pivote', () => {
    const voisinePivotee = { x: 0.5 + 0.14 / 1.6, y: 0.5, w: 0.26, h: 0.14, rotation: 90 };
    expect(blockedSides(centre, [voisinePivotee]).e).toBe(true);
  });
});

describe('tablesTouch / canMerge avec rotation', () => {
  // Deux rectangles longs pivotes a 90 deg, poses cote a cote horizontalement.
  // A 90 deg leur emprise ecran est 0.11 de large : elles se touchent bien.
  const a = { x: 0.5, y: 0.5, w: 0.24, h: 0.11, rotation: 90 };
  const b = { x: 0.5 + 0.11 / 1.6, y: 0.5, w: 0.24, h: 0.11, rotation: 90 };

  it('voit se toucher deux tables pivotees collees bord a bord', () => {
    expect(tablesTouch(a, b)).toBe(true);
  });

  it('les declare fusionnables (bouton Fusionner actif)', () => {
    expect(canMerge([a, b])).toBe(true);
  });

  it('reste correct sans rotation fournie (retrocompatible)', () => {
    const c = { x: 0.5, y: 0.5, w: 0.14, h: 0.14 };
    const d = { x: 0.5 + 0.14 / 1.6, y: 0.5, w: 0.14, h: 0.14 };
    expect(tablesTouch(c, d)).toBe(true);
  });
});

describe('wallObstacles (les murs bloquent les tables)', () => {
  // Mur HORIZONTAL a mi-hauteur, comme ceux d'un plan importe (epaisseur 0.02).
  const wall = { x1: 0.2, y1: 0.5, x2: 0.8, y2: 0.5, thickness: 0.02 };
  const table = { w: 0.14, h: 0.14 };

  it('convertit un mur horizontal en boite fine et centree sur le segment', () => {
    const [box] = wallObstacles([wall]);
    expect(box.x).toBeCloseTo(0.5, 6);
    expect(box.y).toBeCloseTo(0.5, 6);
    expect(box.h).toBeCloseTo(0.02, 6); // epaisseur seule : le mur n'a pas de hauteur
  });

  it('repousse hors du mur une table posee dessus', () => {
    const onWall = { x: 0.5, y: 0.5, ...table };
    const corrected = pushApart(onWall, wallObstacles([wall]), WALL_MIN_GAP);
    const gap = Math.abs(corrected.y - 0.5) - (0.14 + 0.02) / 2;
    expect(gap).toBeGreaterThanOrEqual(WALL_MIN_GAP - 1e-9);
  });

  // L'ecart au mur doit rester DISCRET : une table se pose contre le mur.
  it('laisse la table quasi collee au mur', () => {
    const onWall = { x: 0.5, y: 0.5, ...table };
    const corrected = pushApart(onWall, wallObstacles([wall]), WALL_MIN_GAP);
    const gap = Math.abs(corrected.y - 0.5) - (0.14 + 0.02) / 2;
    expect(gap).toBeLessThan(EDITOR_MIN_GAP); // plus fin qu'entre deux tables
  });

  it('ne touche pas une table loin de tout mur', () => {
    const far = { x: 0.5, y: 0.15, ...table };
    expect(pushApart(far, wallObstacles([wall]), WALL_MIN_GAP)).toEqual({ x: 0.5, y: 0.15 });
  });
});

describe('reservationLateMinutes (badge retard de la liste)', () => {
  const at2000 = '2026-07-19T20:00:00+02:00';

  it('memes seuils que le plan : signale entre +15 et +120 min', () => {
    const r = reservation('r1', 'confirmed', null, at2000);
    const t = (min: number) => new Date(new Date(at2000).getTime() + min * 60_000);
    expect(reservationLateMinutes(r, t(10))).toBeNull();
    expect(reservationLateMinutes(r, t(30))).toBe(30);
    // Au-dela de la fenetre active, le plan libere la table : la liste se tait.
    expect(reservationLateMinutes(r, t(150))).toBeNull();
  });

  it('ignore les statuts non attendus (installee, annulee...)', () => {
    const t = new Date(new Date(at2000).getTime() + 30 * 60_000);
    expect(reservationLateMinutes(reservation('r1', 'seated', 't1', at2000), t)).toBeNull();
    expect(reservationLateMinutes(reservation('r1', 'cancelled', null, at2000), t)).toBeNull();
  });
});

describe('simulationRange', () => {
  it('encadre la soiree : 1 h avant la premiere resa, 2 h apres la derniere, heures pleines', () => {
    // Assertions en EPOCH (jamais getHours()) : le fuseau du runner CI (UTC)
    // ne doit pas influencer le test - seule l'arithmetique de bornage compte.
    const first = new Date('2026-06-22T19:30:00+02:00').getTime();
    const last = new Date('2026-06-22T21:15:00+02:00').getTime();
    const HOUR = 60 * 60_000;
    const range = simulationRange([
      reservation('r1', 'confirmed', 't1', '2026-06-22T19:30:00+02:00'),
      reservation('r2', 'confirmed', 't2', '2026-06-22T21:15:00+02:00'),
    ]);
    // Debut : couvre (premiere - 1 h), arrondi vers le bas de moins d'une heure.
    expect(range.start.getTime()).toBeLessThanOrEqual(first - HOUR);
    expect(range.start.getTime()).toBeGreaterThan(first - 2 * HOUR);
    expect(range.start.getMinutes()).toBe(0);
    // Fin : couvre (derniere + 2 h), arrondi vers le haut de moins d'une heure.
    expect(range.end.getTime()).toBeGreaterThanOrEqual(last + 2 * HOUR);
    expect(range.end.getTime()).toBeLessThan(last + 3 * HOUR);
    expect(range.end.getMinutes()).toBe(0);
  });

  it('ignore les reservations mortes (annulee, no-show)', () => {
    const withDead = simulationRange([
      reservation('r1', 'confirmed', 't1', '2026-06-22T20:00:00+02:00'),
      reservation('r2', 'cancelled', 't2', '2026-06-22T12:00:00+02:00'),
    ]);
    const without = simulationRange([
      reservation('r1', 'confirmed', 't1', '2026-06-22T20:00:00+02:00'),
    ]);
    expect(withDead.start.getTime()).toBe(without.start.getTime());
  });

  it('sans reservation : soiree type 18:00 -> 23:00', () => {
    const range = simulationRange([], new Date('2026-06-22T10:00:00+02:00'));
    expect(range.start.getHours()).toBe(18);
    expect(range.end.getHours()).toBe(23);
  });
});

describe('summarizeRoom', () => {
  function viewOf(
    id: string,
    status: FloorTableStatus,
    partySize: number | null = null,
  ): FloorTableView {
    const res =
      partySize === null ? null : { ...reservation(`r-${id}`, 'confirmed', id), partySize };
    return {
      table: { id, name: id.toUpperCase(), capacity: 4, isActive: true },
      x: 0.5,
      y: 0.5,
      w: 0.1,
      h: 0.1,
      shape: 'square',
      rotation: 0,
      status,
      reservation: res,
      nextTime: null,
      nextDateTime: null,
      lateMinutes: null,
    };
  }

  it('compte les tables par statut', () => {
    const summary = summarizeRoom([
      viewOf('t1', 'libre'),
      viewOf('t2', 'libre'),
      viewOf('t3', 'reservee', 2),
      viewOf('t4', 'installee', 3),
      viewOf('t5', 'installee', 4),
    ]);
    expect(summary.libres).toBe(2);
    expect(summary.reservees).toBe(1);
    expect(summary.installees).toBe(2);
  });

  it('couverts = total des couverts des tables occupees (reservees + installees)', () => {
    const summary = summarizeRoom([
      viewOf('t1', 'libre'),
      viewOf('t2', 'reservee', 2),
      viewOf('t3', 'installee', 5),
    ]);
    // Les tables libres ne comptent pas, meme si elles portaient une resa future.
    expect(summary.couverts).toBe(7);
  });

  it('salle vide -> tout a zero', () => {
    expect(summarizeRoom([])).toEqual({ libres: 0, reservees: 0, installees: 0, couverts: 0 });
  });
});
