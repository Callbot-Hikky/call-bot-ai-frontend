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
});
