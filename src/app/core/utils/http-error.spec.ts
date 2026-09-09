import { HttpErrorResponse } from '@angular/common/http';
import { conflictMessage } from './http-error';

describe('conflictMessage', () => {
  const fallback = 'Échec générique';

  it('traduit le code table_overlap d un 409', () => {
    const err = new HttpErrorResponse({ status: 409, error: { error: 'table_overlap' } });
    expect(conflictMessage(err, fallback)).toBe('Cette table est déjà réservée sur ce créneau.');
  });

  it('traduit le code duplicate_phone d un 409', () => {
    const err = new HttpErrorResponse({ status: 409, error: { error: 'duplicate_phone' } });
    expect(conflictMessage(err, fallback)).toBe('Un client existe déjà avec ce numéro.');
  });

  it('retombe sur le fallback si le code 409 est inconnu', () => {
    const err = new HttpErrorResponse({ status: 409, error: { error: 'autre' } });
    expect(conflictMessage(err, fallback)).toBe(fallback);
  });

  it('retombe sur le fallback si ce n est pas un 409', () => {
    const err = new HttpErrorResponse({ status: 500, error: { error: 'table_overlap' } });
    expect(conflictMessage(err, fallback)).toBe(fallback);
  });

  it('retombe sur le fallback pour une erreur non HTTP', () => {
    expect(conflictMessage(new Error('boom'), fallback)).toBe(fallback);
  });

  // TICKET 08 : motifs de refus d'un changement de couverts. Sans message metier,
  // le personnel verrait un echec sans savoir quoi faire ensuite.
  it('traduit le code no_table_available d un 409', () => {
    const err = new HttpErrorResponse({ status: 409, error: { error: 'no_table_available' } });
    expect(conflictMessage(err, fallback)).toBe(
      'Aucune table libre ne peut asseoir ce nombre de couverts sur ce créneau.',
    );
  });

  it('traduit le code top_up_required d un 409', () => {
    const err = new HttpErrorResponse({ status: 409, error: { error: 'top_up_required' } });
    expect(conflictMessage(err, fallback)).toBe(
      'Le droit de réservation a été payé par couvert : le complément doit être réglé avant.',
    );
  });
});
