import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(KnowledgeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getEntries : GET les entrées du restaurant', async () => {
    const promise = firstValueFrom(service.getEntries('r1'));

    const req = http.expectOne((r) => r.url.endsWith('/restaurants/r1/knowledge'));
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'e1', title: 'Terrasse', content: 'Vingt couverts.', source: 'manual' }]);

    expect((await promise)[0].title).toBe('Terrasse');
  });

  it('createEntry : POST le titre et le contenu', async () => {
    const promise = firstValueFrom(
      service.createEntry('r1', { title: 'Parking', content: 'À deux minutes.' }),
    );

    const req = http.expectOne((r) => r.url.endsWith('/restaurants/r1/knowledge'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Parking', content: 'À deux minutes.' });
    req.flush({ id: 'e2', title: 'Parking', content: 'À deux minutes.', source: 'manual' });

    expect((await promise).id).toBe('e2');
  });

  it('updateEntry et deleteEntry : visent l’entrée par son identifiant', async () => {
    const update = firstValueFrom(service.updateEntry('r1', 'e2', { title: 'T', content: 'C' }));
    const put = http.expectOne((r) => r.url.endsWith('/restaurants/r1/knowledge/e2'));
    expect(put.request.method).toBe('PUT');
    put.flush({ id: 'e2', title: 'T', content: 'C', source: 'manual' });
    expect((await update).title).toBe('T');

    const remove = firstValueFrom(service.deleteEntry('r1', 'e2'), { defaultValue: undefined });
    const del = http.expectOne((r) => r.url.endsWith('/restaurants/r1/knowledge/e2'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await remove;
  });

  it('search : POST la question et renvoie les passages classés', async () => {
    const promise = firstValueFrom(service.search('r1', 'une terrasse ?'));

    const req = http.expectOne((r) => r.url.endsWith('/restaurants/r1/knowledge/search'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ question: 'une terrasse ?' });
    req.flush({
      question: 'une terrasse ?',
      matches: [{ id: 'e1', title: 'Terrasse', content: 'Vingt couverts.', score: 0.8 }],
    });

    expect((await promise).matches[0].score).toBe(0.8);
  });

  it('getOpenQuestions : GET les questions sans réponse', async () => {
    const promise = firstValueFrom(service.getOpenQuestions('r1'));

    const req = http.expectOne((r) => r.url.endsWith('/restaurants/r1/knowledge/questions'));
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'q1', question: 'Menu enfant ?', askedCount: 3, status: 'open' }]);

    expect((await promise)[0].askedCount).toBe(3);
  });

  it('answerQuestion : POST la réponse, ignoreQuestion : POST sans corps utile', async () => {
    const answer = firstValueFrom(service.answerQuestion('r1', 'q1', 'Oui, à neuf euros.'));
    const post = http.expectOne((r) =>
      r.url.endsWith('/restaurants/r1/knowledge/questions/q1/answer'),
    );
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ answer: 'Oui, à neuf euros.' });
    post.flush({ id: 'e9', title: 'Menu enfant ?', content: 'Oui, à neuf euros.' });
    expect((await answer).id).toBe('e9');

    const ignore = firstValueFrom(service.ignoreQuestion('r1', 'q2'), { defaultValue: undefined });
    const ign = http.expectOne((r) =>
      r.url.endsWith('/restaurants/r1/knowledge/questions/q2/ignore'),
    );
    expect(ign.request.method).toBe('POST');
    ign.flush(null, { status: 204, statusText: 'No Content' });
    await ignore;
  });
});
