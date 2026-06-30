import { Reservation, ReservationStatus } from './reservation.model';
import { FloorTable } from './table.model';
import { autoGridLayout, deriveTableStatus } from './floor-plan.model';

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

describe('deriveTableStatus', () => {
  it('table sans reservation -> Libre', () => {
    const result = deriveTableStatus('t1', []);
    expect(result.status).toBe('libre');
    expect(result.reservation).toBeNull();
  });

  it('reservation seated -> Installee', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'seated', 't1')]);
    expect(result.status).toBe('installee');
    expect(result.reservation?.id).toBe('r1');
  });

  it('reservation confirmed -> Reservee', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'confirmed', 't1')]);
    expect(result.status).toBe('reservee');
    expect(result.reservation?.id).toBe('r1');
  });

  it('reservation pending -> Reservee', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'pending', 't1')]);
    expect(result.status).toBe('reservee');
  });

  it('reservation completed -> Libre (non actif)', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'completed', 't1')]);
    expect(result.status).toBe('libre');
    expect(result.reservation).toBeNull();
  });

  it('reservation cancelled -> Libre', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'cancelled', 't1')]);
    expect(result.status).toBe('libre');
  });

  it('reservation no_show -> Libre', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'no_show', 't1')]);
    expect(result.status).toBe('libre');
  });

  it('seated prioritaire sur confirmed pour la meme table', () => {
    const result = deriveTableStatus('t1', [
      reservation('r1', 'confirmed', 't1'),
      reservation('r2', 'seated', 't1'),
    ]);
    expect(result.status).toBe('installee');
    expect(result.reservation?.id).toBe('r2');
  });

  it('Reservee affiche la reservation a venir la plus proche', () => {
    const result = deriveTableStatus('t1', [
      reservation('late', 'confirmed', 't1', '2026-06-22T21:30:00+02:00'),
      reservation('early', 'confirmed', 't1', '2026-06-22T19:00:00+02:00'),
    ]);
    expect(result.status).toBe('reservee');
    expect(result.reservation?.id).toBe('early');
  });

  it('ignore les reservations des autres tables', () => {
    const result = deriveTableStatus('t1', [reservation('r1', 'seated', 't2')]);
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
});
