import { HttpErrorResponse } from '@angular/common/http';

import {
  askedLabel,
  knowledgeErrorMessage,
  knowledgeFieldErrors,
  scorePercent,
} from './knowledge.model';

describe('knowledge.model', () => {
  it('knowledgeFieldErrors : lit les erreurs de champ d’un 400', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: { error: 'Bad Request', fieldErrors: { title: 'must not be blank' } },
    });

    expect(knowledgeFieldErrors(err)).toEqual({ title: 'must not be blank' });
  });

  it('knowledgeFieldErrors : vide hors 400 et hors erreur HTTP', () => {
    expect(knowledgeFieldErrors(new HttpErrorResponse({ status: 502, error: {} }))).toEqual({});
    expect(knowledgeFieldErrors(new Error('x'))).toEqual({});
  });

  it('knowledgeErrorMessage : phrase dédiée quand le fournisseur d’embeddings est en panne', () => {
    const err = new HttpErrorResponse({
      status: 502,
      error: { error: 'embedding_unavailable' },
    });

    expect(knowledgeErrorMessage(err, 'défaut')).toContain("Rien n'a été enregistré");
  });

  it('knowledgeErrorMessage : question déjà traitée, sinon le message par défaut', () => {
    const conflict = new HttpErrorResponse({
      status: 409,
      error: { error: 'question_already_handled' },
    });

    expect(knowledgeErrorMessage(conflict, 'défaut')).toBe('Cette question a déjà été traitée.');
    expect(knowledgeErrorMessage(new HttpErrorResponse({ status: 500 }), 'défaut')).toBe('défaut');
  });

  it('askedLabel et scorePercent : formes affichées', () => {
    expect(askedLabel(3)).toBe('Posée 3 fois');
    expect(scorePercent(0.826)).toBe(83);
    expect(scorePercent(1.4)).toBe(100);
    expect(scorePercent(-0.2)).toBe(0);
  });
});
