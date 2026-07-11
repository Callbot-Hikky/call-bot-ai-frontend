import { TestBed } from '@angular/core/testing';
import { FloorPlanService } from './floor-plan.service';
import { GeometryMap, TableGeometryEntry } from '@core/models/floor-plan-editor.model';

const RESTAURANT = 'rest-test-1';
const KEY = `hk.floorPlan.${RESTAURANT}`;

function entry(x = 0.5, y = 0.5): TableGeometryEntry {
  return { x, y, w: 0.14, h: 0.14, rotation: 0, shape: 'square' };
}

describe('FloorPlanService (geometrie keyee par id back)', () => {
  let service: FloorPlanService;

  beforeEach(() => {
    localStorage.clear();
    // providedIn: 'root' -> chaque TestBed donne une instance fraiche.
    TestBed.configureTestingModule({});
    service = TestBed.inject(FloorPlanService);
  });

  afterEach(() => localStorage.clear());

  it('demarre vide quand aucun plan n est persiste', () => {
    service.load(RESTAURANT);
    expect(service.loaded()).toBe(true);
    expect(service.isEmpty()).toBe(true);
    expect(Object.keys(service.geometry()).length).toBe(0);
  });

  it('initFrom cree un plan et le persiste (plus vide)', () => {
    service.load(RESTAURANT);
    service.initFrom({ 'uuid-a': entry(), 'uuid-b': entry(0.2, 0.2) });
    expect(service.isEmpty()).toBe(false);
    expect(Object.keys(service.geometry()).length).toBe(2);
  });

  it('round-trip save -> load : la geometrie keyee par id back est restituee', () => {
    service.load(RESTAURANT);
    service.initFrom({ 'uuid-a': entry(0.2, 0.3) });
    service.commit({
      'uuid-a': entry(0.2, 0.3),
      'uuid-b': { x: 0.7, y: 0.8, w: 0.2, h: 0.12, rotation: 90, shape: 'rect' },
    });
    service.saveNow();
    expect(service.saveState()).toBe('saved');

    // Nouvelle instance : doit relire exactement ce qui a ete persiste.
    const fresh = TestBed.inject(FloorPlanService);
    fresh.load(RESTAURANT);
    expect(fresh.isEmpty()).toBe(false);
    const b = fresh.geometry()['uuid-b'];
    expect(b).toBeTruthy();
    expect(b.x).toBeCloseTo(0.7, 5);
    expect(b.y).toBeCloseTo(0.8, 5);
    expect(b.rotation).toBe(90);
    expect(b.shape).toBe('rect');
  });

  it('persiste par restaurant (cles independantes)', () => {
    service.load('rest-A');
    service.initFrom({ a: entry() });
    service.saveNow();

    service.load('rest-B');
    expect(service.isEmpty()).toBe(true);

    service.load('rest-A');
    expect(Object.keys(service.geometry()).length).toBe(1);
  });

  it('autosave ecrit apres un commit (sans saveNow explicite)', async () => {
    service.load(RESTAURANT);
    service.initFrom({ a: entry() });
    service.commit({ a: entry(), b: entry(0.3, 0.3) });
    expect(service.saveState()).toBe('dirty');
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(service.saveState()).toBe('saved');

    const fresh = TestBed.inject(FloorPlanService);
    fresh.load(RESTAURANT);
    expect(Object.keys(fresh.geometry()).length).toBe(2);
  });

  it('undo annule la derniere action', () => {
    service.load(RESTAURANT);
    service.initFrom({ a: entry() });
    expect(service.canUndo()).toBe(false);

    service.commit({ a: entry(), b: entry() });
    expect(Object.keys(service.geometry()).length).toBe(2);
    expect(service.canUndo()).toBe(true);

    service.undo();
    expect(Object.keys(service.geometry())).toEqual(['a']);
  });

  it('redo retablit l action annulee', () => {
    service.load(RESTAURANT);
    service.initFrom({ a: entry() });
    service.commit({ a: entry(), b: entry() });
    service.undo();
    expect(Object.keys(service.geometry()).length).toBe(1);
    expect(service.canRedo()).toBe(true);

    service.redo();
    expect(Object.keys(service.geometry()).length).toBe(2);
  });

  it('un nouveau commit invalide le redo', () => {
    service.load(RESTAURANT);
    service.initFrom({ a: entry() });
    service.commit({ a: entry(), b: entry() });
    service.undo();
    expect(service.canRedo()).toBe(true);

    service.commit({ a: entry(), c: entry() });
    expect(service.canRedo()).toBe(false);
  });

  it('merge complete la geometrie SANS entree d historique (semis)', () => {
    service.load(RESTAURANT);
    service.initFrom({ a: entry() });
    service.merge({ b: entry(0.4, 0.4) });
    expect(Object.keys(service.geometry()).sort()).toEqual(['a', 'b']);
    // Pas d'undo possible : le semis initial ne doit pas etre annulable.
    expect(service.canUndo()).toBe(false);
  });

  it('removeEntry retire la geometrie d une table supprimee', () => {
    service.load(RESTAURANT);
    service.initFrom({ a: entry(), b: entry() });
    service.removeEntry('a');
    expect(Object.keys(service.geometry())).toEqual(['b']);
  });

  it('load reinitialise l historique', () => {
    service.load(RESTAURANT);
    service.initFrom({ a: entry() });
    service.commit({ a: entry(), b: entry() });
    expect(service.canUndo()).toBe(true);

    service.load(RESTAURANT);
    expect(service.canUndo()).toBe(false);
  });

  it('tolere des donnees corrompues en localStorage (retour vide)', () => {
    localStorage.setItem(KEY, '{ pas du json');
    service.load(RESTAURANT);
    expect(service.isEmpty()).toBe(true);
  });

  it('detecte l ANCIEN format (tables autonomes) : purge et repart proprement', () => {
    // Ancien modele Phase 2 : { restaurantId, tables: EditorTable[] } sans version.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        restaurantId: RESTAURANT,
        tables: [
          { id: 'tbl-x', label: 'T1', shape: 'square', x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
        ],
      }),
    );
    service.load(RESTAURANT);
    // Pas de crash, plan considere absent, cle purgee.
    expect(service.isEmpty()).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('persiste au format v2 (version + geometry)', () => {
    service.load(RESTAURANT);
    service.initFrom({ 'uuid-a': entry() });
    service.saveNow();
    const raw = JSON.parse(localStorage.getItem(KEY)!) as {
      version: number;
      geometry: GeometryMap;
    };
    expect(raw.version).toBe(2);
    expect(raw.geometry['uuid-a']).toBeTruthy();
  });

  describe('murs decoratifs (import Pascal)', () => {
    const wall = { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, thickness: 0.02 };

    it('setWalls pose les murs et cree le plan si besoin', () => {
      service.load(RESTAURANT);
      expect(service.walls().length).toBe(0);
      service.setWalls([wall]);
      expect(service.isEmpty()).toBe(false);
      expect(service.walls().length).toBe(1);
    });

    it('les murs survivent aux commits et a l undo (hors historique)', () => {
      service.load(RESTAURANT);
      service.initFrom({ 'uuid-a': entry() });
      service.setWalls([wall]);
      service.commit({ 'uuid-a': entry(0.3, 0.3) });
      expect(service.walls().length).toBe(1);
      service.undo();
      expect(service.walls().length).toBe(1);
    });

    it('round-trip save -> load : les murs sont restitues', () => {
      service.load(RESTAURANT);
      service.initFrom({ 'uuid-a': entry() });
      service.setWalls([wall]);
      service.saveNow();

      service.load(RESTAURANT);
      expect(service.walls().length).toBe(1);
      expect(service.walls()[0].x2).toBe(0.9);
    });

    it('initFrom (template) ne herite PAS des murs du plan precedent', () => {
      service.load(RESTAURANT);
      service.initFrom({ 'uuid-a': entry() });
      service.setWalls([wall]);
      service.initFrom({ 'uuid-b': entry() });
      expect(service.walls().length).toBe(0);
    });

    it('filtre les entrees de geometrie corrompues a la lecture', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          version: 2,
          restaurantId: RESTAURANT,
          geometry: { 'uuid-a': entry(), 'uuid-bad': 'garbage', 'uuid-null': null },
        }),
      );
      service.load(RESTAURANT);
      expect(Object.keys(service.geometry())).toEqual(['uuid-a']);
    });

    it('ignore les murs corrompus a la lecture', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          version: 2,
          restaurantId: RESTAURANT,
          geometry: { 'uuid-a': entry() },
          walls: [wall, { x1: 'oops' }, null],
        }),
      );
      service.load(RESTAURANT);
      expect(service.walls().length).toBe(1);
    });
  });
});
