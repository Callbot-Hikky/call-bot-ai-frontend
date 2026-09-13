import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HkDayPicker } from './hk-day-picker';
import { localDateKey } from '@core/utils/format';

describe('HkDayPicker', () => {
  let fixture: ComponentFixture<HkDayPicker>;
  const emitted: string[] = [];

  beforeEach(async () => {
    emitted.length = 0;
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(HkDayPicker);
    fixture.componentRef.setInput('day', '2026-09-13');
    fixture.componentInstance.dayChange.subscribe((d) => emitted.push(d));
    await fixture.whenStable();
  });

  const click = (testId: string) =>
    (
      fixture.nativeElement.querySelector(`[data-testid="${testId}"] button`) ??
      fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)
    ).click();

  it('la veille et le lendemain, y compris au changement de mois', async () => {
    click('day-prev');
    click('day-next');
    fixture.componentRef.setInput('day', '2026-09-30');
    await fixture.whenStable();
    click('day-next');
    expect(emitted).toEqual(['2026-09-12', '2026-09-14', '2026-10-01']);
  });

  it('une date saisie est emise, et « Aujourd hui » ramene a la date du jour', async () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="day-input"]',
    );
    input.value = '2026-12-24';
    input.dispatchEvent(new Event('change'));
    expect(emitted).toEqual(['2026-12-24']);
    // Le parent applique le jour : le bouton « Aujourd'hui » apparait alors.
    fixture.componentRef.setInput('day', '2026-12-24');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="day-today"]')).not.toBeNull();
    click('day-today');
    expect(emitted[1]).toBe(localDateKey());
    fixture.componentRef.setInput('day', localDateKey());
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="day-today"]')).toBeNull();
  });
});
