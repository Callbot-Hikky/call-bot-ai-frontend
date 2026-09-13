import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HkNewReservationDialog, NewReservationInput } from './hk-new-reservation-dialog';
import { localDateKey } from '@core/utils/format';

// Le dialogue propose le jour que la page affiche, et la date reste modifiable.
describe('HkNewReservationDialog', () => {
  let fixture: ComponentFixture<HkNewReservationDialog>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HkNewReservationDialog);
    fixture.componentRef.setInput('day', '2030-01-15');
    await fixture.whenStable();
  });

  const open = async () => {
    fixture.componentInstance.state.set('open');
    await fixture.whenStable();
  };

  it('a l ouverture, la date proposee est le jour affiche ; l heure saisie s y applique', async () => {
    await open();
    expect(fixture.componentInstance['date']()).toBe('2030-01-15');
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

  it('la date se change dans le formulaire sans toucher au jour consulte', async () => {
    await open();
    const emitted: NewReservationInput[] = [];
    fixture.componentInstance.createReservation.subscribe((i) => emitted.push(i));
    fixture.componentInstance['date'].set('2030-02-03');
    fixture.componentInstance['phone'].set('0612345678');
    fixture.componentInstance['time'].set('12:00');
    fixture.componentInstance['submit'](new Event('submit'));
    expect(emitted[0].dateTime.getMonth() + 1).toBe(2);
    expect(emitted[0].dateTime.getDate()).toBe(3);
    expect(fixture.componentInstance.day()).toBe('2030-01-15');
  });

  it('un jour passe consulte propose aujourd hui, et une date passee bloque', async () => {
    fixture.componentRef.setInput('day', '2020-01-15');
    await open();
    expect(fixture.componentInstance['date']()).toBe(localDateKey());
    fixture.componentInstance['date'].set('2020-01-15');
    fixture.componentInstance['time'].set('23:00');
    expect(fixture.componentInstance['timeInPast']()).toBe(true);
    expect(fixture.componentInstance['valid']()).toBe(false);
  });
});
