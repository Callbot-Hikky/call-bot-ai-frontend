import { chairSlots, tableLabelParts } from './hk-floor-plan-3d';
import { FloorTableView } from '@core/models/floor-plan.model';
import { Reservation } from '@core/models/reservation.model';

function view(partial: Partial<FloorTableView>): FloorTableView {
  return {
    table: { id: 't1', name: 'T1', capacity: 4, zone: null },
    x: 0.5,
    y: 0.5,
    w: 0.14,
    h: 0.14,
    shape: 'square',
    rotation: 0,
    status: 'libre',
    reservation: null,
    nextTime: null,
    nextDateTime: null,
    lateMinutes: null,
    ...partial,
  } as FloorTableView;
}

function reservation(customerName: string, dateTime: string): Reservation {
  return { id: 'r1', customerName, dateTime, partySize: 4, status: 'seated' } as Reservation;
}

describe('chairSlots', () => {
  it('place n chaises en cercle autour d une ronde', () => {
    const slots = chairSlots('round', 1.2, 1.2, 6);
    expect(slots.length).toBe(6);
    // Toutes a la meme distance du centre (rayon + marge).
    const dist = slots.map((s) => Math.hypot(s.x, s.z));
    for (const d of dist) {
      expect(d).toBeCloseTo(dist[0], 5);
    }
  });

  it('repartit sur les 4 cotes d un rectangle (cotes longs d abord)', () => {
    const slots = chairSlots('rect', 1.8, 0.9, 6);
    expect(slots.length).toBe(6);
    const north = slots.filter((s) => s.z < -0.4).length;
    const south = slots.filter((s) => s.z > 0.4).length;
    // 2 chaises par cote long, 1 par cote court.
    expect(north).toBe(2);
    expect(south).toBe(2);
  });

  it('un bar n a des tabourets que d un seul cote', () => {
    const slots = chairSlots('bar', 3, 0.6, 5);
    expect(slots.length).toBe(5);
    // Tous du meme cote (z identique, positif).
    expect(slots.every((s) => s.z === slots[0].z && s.z > 0)).toBe(true);
  });

  it('plafonne le nombre de chaises dessinees', () => {
    expect(chairSlots('round', 2, 2, 40).length).toBeLessThanOrEqual(16);
  });
});

describe('tableLabelParts', () => {
  it('table en retard : nom du client + minutes en rouge', () => {
    const parts = tableLabelParts(
      view({
        status: 'reservee',
        lateMinutes: 25,
        reservation: reservation('Marc', '2026-07-11T19:30:00'),
      }),
    );
    expect(parts.subtitle).toContain('Marc');
    expect(parts.subtitle).toContain('+25 min');
    expect(parts.color).toBe('#d64545');
  });

  it('table installee : client + heure en bleu', () => {
    const parts = tableLabelParts(
      view({ status: 'installee', reservation: reservation('Sarah', '2026-07-11T19:30:00') }),
    );
    expect(parts.subtitle).toContain('Sarah');
    expect(parts.subtitle).toContain('19:30');
    expect(parts.color).toBe('#3d7fd9');
  });

  it('table libre avec une resa plus tard : « -> heure » en gris', () => {
    const parts = tableLabelParts(view({ status: 'libre', nextTime: '21:00' }));
    expect(parts.subtitle).toBe('→ 21:00');
    expect(parts.color).toBe('#8a8378');
  });

  it('table libre sans rien : pas de sous-titre', () => {
    expect(tableLabelParts(view({})).subtitle).toBeNull();
  });
});
