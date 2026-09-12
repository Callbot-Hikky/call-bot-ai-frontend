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
    const reschedule: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '[data-testid="link-reschedule"]',
    );
    expect(reschedule.getAttribute('href')).toBe('/client/reservations/r-1/reschedule');
  });

  it('un lien qui ne correspond a rien le dit, sans afficher la coche verte', async () => {
    fixture = TestBed.createComponent(ReservationConfirmedPage);
    fixture.componentRef.setInput('id', 'r-inconnue');
    await fixture.whenStable();
    http
      .expectOne('/api/public/reservations/r-inconnue')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Réservation introuvable');
    expect(fixture.nativeElement.textContent).not.toContain('confirmée');
  });

  it('une reservation annulee le dit, sans coche verte ni lien de replanification', async () => {
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
      status: 'cancelled',
      customerFirstName: 'Nadia',
    });
    await fixture.whenStable();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Réservation annulée');
    expect(text).not.toContain('confirmée !');
    expect(fixture.nativeElement.querySelector('[data-testid="link-reschedule"]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="link-book-again"]').getAttribute('href'),
    ).toBe('/client/restaurants/rest-1/schedule');
  });

  it('sans prenom connu, affiche « Client » plutot qu un vide', async () => {
    fixture = TestBed.createComponent(ReservationConfirmedPage);
    fixture.componentRef.setInput('id', 'r-2');
    await fixture.whenStable();
    http.expectOne('/api/public/reservations/r-2').flush({
      id: 'r-2',
      restaurantId: 'rest-1',
      restaurantName: 'Chez Test',
      startsAt: '2026-09-12T19:30:00+02:00',
      endsAt: '2026-09-12T21:00:00+02:00',
      partySize: 1,
      status: 'pending',
      customerFirstName: null,
    });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Client');
    expect(fixture.nativeElement.textContent).toContain('1 personne');
  });
});
