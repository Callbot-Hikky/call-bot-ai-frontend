import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { formatDate } from '@angular/common';

import { HkReservationSlotPicker } from './hk-reservation-slot-picker';
import { RescheduleDay } from '@core/models/reservation.model';

registerLocaleData(localeFr);

// Les heures affichees dependent du fuseau de la machine (Paris ici, UTC en CI) :
// l'attendu est calcule avec le meme formatage que le composant.
const hhmm = (iso: string) => formatDate(iso, 'HH:mm', 'fr');

const slot = (startsAt: string) => ({ startsAt, endsAt: startsAt, tableId: 't', capacity: 4 });
const DAYS: RescheduleDay[] = [
  { date: '2026-09-11', slots: [] },
  {
    date: '2026-09-12',
    slots: [slot('2026-09-12T11:00:00+02:00'), slot('2026-09-12T11:30:00+02:00')],
  },
  { date: '2026-09-13', slots: [slot('2026-09-13T11:00:00+02:00')] },
];

describe('HkReservationSlotPicker', () => {
  let fixture: ComponentFixture<HkReservationSlotPicker>;

  async function render(expandFirstAvailable: boolean): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [HkReservationSlotPicker],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HkReservationSlotPicker);
    fixture.componentRef.setInput('days', DAYS);
    fixture.componentRef.setInput('expandFirstAvailable', expandFirstAvailable);
    await fixture.whenStable();
  }

  const slotButtons = () =>
    [...fixture.nativeElement.querySelectorAll('button')].filter((b: HTMLButtonElement) =>
      /^\d{2}:\d{2}$/.test(b.textContent?.trim() ?? ''),
    );

  it('replie tout par defaut (replanification : seul le jour de la resa s ouvre)', async () => {
    await render(false);
    expect(slotButtons()).toHaveLength(0);
  });

  it('ouvre d emblee le premier jour qui a des creneaux, pas la journee vide', async () => {
    await render(true);
    expect(slotButtons().map((b) => b.textContent?.trim())).toEqual(
      DAYS[1].slots.map((s) => hhmm(s.startsAt)),
    );
  });

  it('un rechargement des creneaux ne rouvre pas un jour que le client a replie', async () => {
    await render(true);
    expect(slotButtons().length).toBeGreaterThan(0);
    fixture.componentInstance.toggleDay(DAYS[1].date);
    await fixture.whenStable();
    expect(slotButtons()).toHaveLength(0);
    fixture.componentRef.setInput(
      'days',
      DAYS.map((d) => ({ ...d, slots: [...d.slots] })),
    );
    await fixture.whenStable();
    expect(slotButtons()).toHaveLength(0);
  });

  it('choisir un creneau l emet et le marque selectionne', async () => {
    await render(true);
    const picked: unknown[] = [];
    fixture.componentInstance.slotPicked.subscribe((s) => picked.push(s));
    slotButtons()[1].click();
    await fixture.whenStable();
    expect(picked).toEqual([DAYS[1].slots[1]]);
    expect(slotButtons()[1].className).toContain('bg-primary');
  });
});
