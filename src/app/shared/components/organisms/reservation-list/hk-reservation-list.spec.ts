import { TestBed } from '@angular/core/testing';
import { HkReservationList } from './hk-reservation-list';

describe('HkReservationList', () => {
  it('sans filtre, dit qu il n y a rien ce jour ; avec un filtre, que rien ne correspond', async () => {
    const fixture = TestBed.createComponent(HkReservationList);
    fixture.componentRef.setInput('reservations', []);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Aucune réservation pour cette journée.');

    fixture.componentRef.setInput('filtered', true);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('ne correspond à ces critères');
  });
});
