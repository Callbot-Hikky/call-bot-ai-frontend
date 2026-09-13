import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HkNewReservationDialog, NewReservationInput } from './hk-new-reservation-dialog';

// Le dialogue cree sur le jour que la page affiche, pas forcement aujourd'hui.
describe('HkNewReservationDialog', () => {
  let fixture: ComponentFixture<HkNewReservationDialog>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HkNewReservationDialog);
    fixture.componentRef.setInput('day', '2030-01-15');
    await fixture.whenStable();
  });

  it('la date emise est celle du jour affiche, a l heure saisie', () => {
    const emitted: NewReservationInput[] = [];
    fixture.componentInstance.createReservation.subscribe((i) => emitted.push(i));
    fixture.componentInstance['phone'].set('0612345678');
    fixture.componentInstance['time'].set('19:30');
    fixture.componentInstance['submit'](new Event('submit'));
    expect(emitted).toHaveLength(1);
    const d = emitted[0].dateTime;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2030, 1, 15, 19, 30,
    ]);
    expect(fixture.componentInstance['timeInPast']()).toBe(false);
  });

  it('un jour passe rend toute heure passee', async () => {
    fixture.componentRef.setInput('day', '2020-01-15');
    fixture.componentInstance['time'].set('23:00');
    await fixture.whenStable();
    expect(fixture.componentInstance['timeInPast']()).toBe(true);
  });
});
