import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { ReservationModifyPage } from './reservation-modify-page';
import type { PublicModification } from '@core/models/guarantee.model';

/**
 * Ce que la page décide toute seule : quand redemander des créneaux, ce qu'elle annonce
 * avant le clic, et ce qu'elle envoie. La règle de tarification est au backend et n'est
 * pas rejouée ici.
 */
describe('ReservationModifyPage', () => {
  let http: HttpTestingController;

  /** Une table de quatre, payée, à 15,00 € le couvert. */
  const paidForFour: PublicModification = {
    restaurantName: 'Chez Payant',
    startsAt: '2030-07-01T19:00:00Z',
    partySize: 4,
    guaranteeMode: 'booking_fee',
    guaranteeStatus: 'secured',
    status: 'confirmed',
    centsPerGuest: 1500,
    currency: 'eur',
    open: true,
    closesAt: '2030-07-01T19:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationModifyPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Monte la page, répond à l'appel de description, puis à celui des créneaux. */
  async function open(reservation: Partial<PublicModification> = {}) {
    const fixture = TestBed.createComponent(ReservationModifyPage);
    fixture.componentRef.setInput('token', 'mod-1');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/modifier/mod-1'))
      .flush({
        ...paidForFour,
        ...reservation,
      });
    await fixture.whenStable();

    return fixture;
  }

  /** Répond à la requête de créneaux en attente, avec un créneau par jour. */
  async function answerSlots(startsAt = '2030-07-01T20:00:00Z') {
    const req = http.expectOne((r) => r.url.includes('/modifier/mod-1/creneaux'));
    req.flush({
      days: [
        {
          date: '2030-07-01',
          slots: [{ startsAt, endsAt: '2030-07-01T22:00:00Z', tableId: 't1', capacity: 4 }],
        },
        // Un jour sans créneau : il ne doit pas apparaître comme une section vide.
        { date: '2030-07-02', slots: [] },
      ],
    });

    return req;
  }

  it('demande les créneaux pour la tablée telle qu’elle est enregistrée', async () => {
    const fixture = await open();

    const req = await answerSlots();
    expect(req.request.params.get('partySize')).toBe('4');
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Chez Payant');
  });

  it('redemande les créneaux dès que la tablée change', async () => {
    // Une table pour huit n'est pas une table pour deux : la grille ne peut pas rester
    // celle de l'ancienne tablée.
    const fixture = await open();
    await answerSlots();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[aria-label="Retirer un couvert"]').click();
    await fixture.whenStable();

    const req = http.expectOne((r) => r.url.includes('/modifier/mod-1/creneaux'));
    expect(req.request.params.get('partySize')).toBe('3');
    req.flush({ days: [] });
    await fixture.whenStable();
  });

  it('annonce le remboursement avant le clic, jamais après', async () => {
    const fixture = await open();
    await answerSlots();
    await fixture.whenStable();

    // Quatre à trois : un couvert à 15,00 €.
    fixture.nativeElement.querySelector('[aria-label="Retirer un couvert"]').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url.includes('/creneaux')).flush({ days: [] });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('remboursés');
    expect(fixture.nativeElement.textContent).toContain('15,00');
  });

  it('annonce le complément avant le clic quand la tablée grandit', async () => {
    const fixture = await open();
    await answerSlots();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[aria-label="Ajouter un couvert"]').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url.includes('/creneaux')).flush({ days: [] });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('complément');
    expect(fixture.nativeElement.textContent).toContain('15,00');
  });

  it('n’annonce aucun montant sur une réservation gratuite', async () => {
    const fixture = await open({
      guaranteeMode: 'none',
      guaranteeStatus: 'not_required',
      centsPerGuest: null,
    });
    await answerSlots();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[aria-label="Retirer un couvert"]').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url.includes('/creneaux')).flush({ days: [] });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('remboursés');
  });

  it('n’envoie que ce qui a changé', async () => {
    // Ce qui est omis est laissé tel quel côté serveur : le convive ne doit pas pouvoir
    // effacer une table ou une note en ne les mentionnant pas.
    const fixture = await open();
    await answerSlots();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[aria-label="Retirer un couvert"]').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url.includes('/creneaux')).flush({ days: [] });
    await fixture.whenStable();

    submit(fixture);
    await fixture.whenStable();

    const req = http.expectOne((r) => r.url.endsWith('/modifier/mod-1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ partySize: 3 });
    req.flush({ startsAt: paidForFour.startsAt, partySize: 3, refundedAmountCents: 1500 });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Réservation modifiée');
  });

  it('envoie le créneau choisi, seul, quand seule l’heure bouge', async () => {
    const fixture = await open();
    await answerSlots('2030-07-01T20:00:00Z');
    await fixture.whenStable();

    slotButton(fixture, '2030-07-01T20:00:00Z').click();
    await fixture.whenStable();
    submit(fixture);
    await fixture.whenStable();

    const req = http.expectOne((r) => r.url.endsWith('/modifier/mod-1'));
    expect(req.request.body).toEqual({ startsAt: '2030-07-01T20:00:00Z' });
    req.flush({ startsAt: '2030-07-01T20:00:00Z', partySize: 4, refundedAmountCents: 0 });
    await fixture.whenStable();
  });

  it('ne propose rien quand le restaurateur a fermé les modifications', async () => {
    // Le lien ouvre une page qui dit pourquoi, plutôt qu'une erreur qui laisserait
    // croire la réservation disparue. Et aucun créneau n'est demandé.
    const fixture = await open({ open: false });

    expect(fixture.nativeElement.textContent).toContain('closes');
    expect(fixture.nativeElement.textContent).toContain('Appelez le restaurant');
    expect(fixture.nativeElement.querySelector('[aria-label="Retirer un couvert"]')).toBeNull();
  });

  it('emmène le convive régler le complément quand la hausse doit de l’argent', async () => {
    // La hausse n'est pas faite tant qu'elle n'est pas payée : afficher une confirmation
    // laisserait croire le contraire. Le jeton du complément voyage avec la réponse.
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = await open();
    await answerSlots();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[aria-label="Ajouter un couvert"]').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url.includes('/creneaux')).flush({ days: [] });
    await fixture.whenStable();

    submit(fixture);
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/modifier/mod-1'))
      .flush({
        startsAt: paidForFour.startsAt,
        partySize: 4,
        refundedAmountCents: 0,
        pendingTopUp: {
          targetPartySize: 5,
          amountCents: 1500,
          currency: 'eur',
          expiresAt: '2030-07-01T18:30:00Z',
        },
        topUpPaymentToken: 'top-up-link',
      });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/client/reservations/complement', 'top-up-link']);
  });

  it('n’annonce ni remboursement ni complément sous garantie no-show', async () => {
    // La carte est enregistrée et jamais débitée : le montant par couvert y est une
    // PÉNALITÉ. L'annoncer comme un remboursement promettrait le retour d'une somme
    // qui n'est jamais entrée.
    const fixture = await open({ guaranteeMode: 'no_show' });
    await answerSlots();
    await fixture.whenStable();

    fixture.nativeElement.querySelector('[aria-label="Retirer un couvert"]').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url.includes('/creneaux')).flush({ days: [] });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('remboursés');
    expect(fixture.nativeElement.textContent).not.toContain('complément de');
  });

  it('distingue une panne réseau d’une salle complète', async () => {
    const fixture = await open();
    http
      .expectOne((r) => r.url.includes('/creneaux'))
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('pas pu être chargés');
    expect(fixture.nativeElement.textContent).not.toContain("Aucun créneau n'est libre");
  });

  it('dit jusqu’à quand la modification reste ouverte', async () => {
    const fixture = await open();
    await answerSlots();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Modifiable en ligne jusqu');
  });

  it('ne compte pas comme un changement le fait de re-choisir l’horaire actuel', async () => {
    // Sauver un non-changement enverrait une requête pour rien et préviendrait le
    // restaurant d'une modification qui n'a pas eu lieu.
    const fixture = await open();
    await answerSlots(paidForFour.startsAt as string);
    await fixture.whenStable();

    slotButton(fixture, paidForFour.startsAt as string).click();
    await fixture.whenStable();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(buttons.find((b) => b.textContent?.includes('Enregistrer'))?.disabled).toBe(true);
  });

  it('ne révèle rien d’une réservation à laquelle son lien a survécu', async () => {
    // Annulée ou déjà servie : le lien résout encore mais ne livre plus que qui appeler.
    const fixture = await open({
      open: false,
      startsAt: null,
      partySize: null,
      centsPerGuest: null,
      status: 'cancelled',
    });

    expect(fixture.nativeElement.textContent).toContain('Appelez le restaurant');
    expect(fixture.nativeElement.textContent).not.toContain('Couverts');
  });

  it('affiche un message d’erreur quand le créneau vient d’être pris', async () => {
    const fixture = await open();
    await answerSlots('2030-07-01T20:00:00Z');
    await fixture.whenStable();

    slotButton(fixture, '2030-07-01T20:00:00Z').click();
    await fixture.whenStable();
    submit(fixture);
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/modifier/mod-1'))
      .flush(
        { message: "Aucune table n'est libre sur ce créneau pour 4 personnes" },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Aucune table n'est libre");
  });
});

function submit(fixture: { nativeElement: HTMLElement }): void {
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button'));
  const save = buttons.find((b) => b.textContent?.includes('Enregistrer'));
  save?.click();
}

/**
 * Le bouton du créneau, retrouvé par l'heure telle que la page l'affiche.
 *
 * <p>Le libellé dépend du fuseau de la machine qui exécute les tests : la même heure
 * s'écrit 20:00 à Londres et 22:00 à Paris. On refait donc le même formatage plutôt que
 * de figer une chaîne qui ne vaudrait que sur un seul poste.
 */
function slotButton(fixture: { nativeElement: HTMLElement }, iso: string): HTMLButtonElement {
  const label = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  const buttons = Array.from(fixture.nativeElement.querySelectorAll('button'));
  const match = buttons.find((b) => b.textContent?.trim() === label);
  if (!match) {
    throw new Error(`Aucun bouton de créneau « ${label} »`);
  }

  return match as HTMLButtonElement;
}
