import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ReservationConfirmedPage } from './reservation-confirmed';

registerLocaleData(localeFr);

describe('ReservationConfirmedPage', () => {
  let fixture: ComponentFixture<ReservationConfirmedPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationConfirmedPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lit la reservation par la route publique et affiche le recapitulatif avec le lien menu', async () => {
    fixture = TestBed.createComponent(ReservationConfirmedPage);
    fixture.componentRef.setInput('id', 'r-1');
    await fixture.whenStable();
    http.expectOne('/api/public/reservations/r-1').flush({
      id: 'r-1',
      restaurantId: 'rest-1',
      restaurantName: "La Table d'Ines",
      startsAt: '2026-09-12T19:30:00+02:00',
      endsAt: '2026-09-12T21:00:00+02:00',
      partySize: 2,
      status: 'pending',
      customerFirstName: 'Nadia',
    });
    await fixture.whenStable();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain("La Table d'Ines");
    expect(text).toContain('Nadia');
    expect(text).toContain('2 personnes');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '[data-testid="link-menu"]',
    );
    expect(link.getAttribute('href')).toBe('/client/restaurants/rest-1/menu?reservation=r-1');
  });
});
