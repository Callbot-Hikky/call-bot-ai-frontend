import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AssistantKnowledgePage } from './assistant-knowledge-page';
import { ConfirmService } from '@shared/components/molecules/confirm-dialog/hk-confirm-dialog';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import type { KnowledgeEntry, UnansweredQuestion } from '@core/models/knowledge.model';

const RID = 'r-1';
const BASE = `/restaurants/${RID}/knowledge`;

const QUESTIONS: UnansweredQuestion[] = [
  {
    id: 'q1',
    question: 'Vous avez un menu enfant ?',
    askedCount: 3,
    lastAskedAt: '2026-10-01T17:47:00Z',
    status: 'open',
  },
  {
    id: 'q2',
    question: 'On peut venir avec un chien ?',
    askedCount: 1,
    lastAskedAt: '2026-09-30T18:00:00Z',
    status: 'open',
  },
];

const ENTRIES: KnowledgeEntry[] = [
  {
    id: 'e1',
    title: 'Vous avez une terrasse ?',
    content: 'Oui, vingt couverts.',
    source: 'manual',
    createdAt: '2026-09-08T10:00:00Z',
    updatedAt: '2026-09-08T10:00:00Z',
  },
];

describe('AssistantKnowledgePage', () => {
  let fixture: ComponentFixture<AssistantKnowledgePage>;
  let http: HttpTestingController;
  let toast: ToastService;
  const restaurantId = signal<string | null>(RID);
  const confirm = { ask: vi.fn(() => of(true)) };

  beforeEach(async () => {
    restaurantId.set(RID);
    confirm.ask.mockClear();
    await TestBed.configureTestingModule({
      imports: [AssistantKnowledgePage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SessionService, useValue: { restaurantId } },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    vi.spyOn(toast, 'show');
  });

  afterEach(() => http.verify());

  async function render(
    questions: UnansweredQuestion[] = QUESTIONS,
    entries: KnowledgeEntry[] = ENTRIES,
  ): Promise<void> {
    fixture = TestBed.createComponent(AssistantKnowledgePage);
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith(`${BASE}/questions`))
      .flush(questions);
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith(BASE)).flush(entries);
    await fixture.whenStable();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(id: string): HTMLElement | null {
    return el().querySelector(`[data-testid="${id}"]`);
  }

  function click(testId: string): void {
    (byTestId(testId)?.querySelector('button') as HTMLButtonElement).click();
  }

  async function type(inputId: string, value: string): Promise<void> {
    const input = el().querySelector(`#${inputId}`) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('affiche les questions en attente, les plus posées d’abord, et ce que l’assistant sait', async () => {
    await render();

    expect(byTestId('questions-count')?.textContent).toContain('2 en attente');
    expect(byTestId('question-q1')?.textContent).toContain('Vous avez un menu enfant ?');
    expect(byTestId('question-q1')?.textContent).toContain('Posée 3 fois');
    expect(byTestId('entry-e1')?.textContent).toContain('Oui, vingt couverts.');
  });

  it('répondre : la question quitte la liste et la réponse devient une fiche', async () => {
    await render();
    await type('answer-q1', '  Oui, un menu enfant à neuf euros. ');
    click('answer-save-q1');

    const req = http.expectOne((r) => r.url.endsWith(`${BASE}/questions/q1/answer`));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ answer: 'Oui, un menu enfant à neuf euros.' });
    req.flush({
      id: 'e9',
      title: 'Vous avez un menu enfant ?',
      content: 'Oui, un menu enfant à neuf euros.',
      source: 'unanswered',
      createdAt: '2026-10-02T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
    });
    await fixture.whenStable();

    expect(byTestId('question-q1')).toBeNull();
    expect(byTestId('entry-e9')?.textContent).toContain(
      'Réponse à une question posée au téléphone',
    );
    expect(toast.show).toHaveBeenCalledWith(
      expect.stringContaining('Réponse enregistrée'),
      'success',
    );
  });

  it('répondre : le bouton reste inactif tant que la réponse est vide', async () => {
    await render();

    const save = byTestId('answer-save-q1')?.querySelector('button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await type('answer-q1', 'Oui.');
    expect(save.disabled).toBe(false);
  });

  it('répondre : une panne du service d’embeddings s’affiche sous la question, rien ne disparaît', async () => {
    await render();
    await type('answer-q1', 'Oui.');
    click('answer-save-q1');

    http
      .expectOne((r) => r.url.endsWith(`${BASE}/questions/q1/answer`))
      .flush({ error: 'embedding_unavailable' }, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    expect(byTestId('question-q1')?.textContent).toContain("Rien n'a été enregistré");
  });

  it('ignorer : POST puis la question quitte la liste', async () => {
    await render();
    click('answer-ignore-q2');

    const req = http.expectOne((r) => r.url.endsWith(`${BASE}/questions/q2/ignore`));
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(byTestId('question-q2')).toBeNull();
    expect(byTestId('questions-count')?.textContent).toContain('1 en attente');
  });

  it('états vides : aucune question, aucune fiche', async () => {
    await render([], []);

    expect(byTestId('questions-card')?.textContent).toContain('Aucune question en attente');
    expect(byTestId('entries-card')?.textContent).toContain('ne sait encore rien de particulier');
    expect(byTestId('questions-count')).toBeNull();
  });

  it('erreur de chargement : message et bouton Réessayer qui relance la requête', async () => {
    fixture = TestBed.createComponent(AssistantKnowledgePage);
    await fixture.whenStable();
    http
      .expectOne((r) => r.url.endsWith(`${BASE}/questions`))
      .flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith(BASE)).flush(ENTRIES);
    await fixture.whenStable();

    expect(byTestId('questions-error')).not.toBeNull();
    (byTestId('questions-error')?.querySelector('button') as HTMLButtonElement).click();
    http.expectOne((r) => r.url.endsWith(`${BASE}/questions`)).flush(QUESTIONS);
    await fixture.whenStable();

    expect(byTestId('question-q1')).not.toBeNull();
  });

  it('ajouter : POST la fiche, elle apparaît en tête et le formulaire se ferme', async () => {
    await render([], ENTRIES);
    click('entry-add');
    await fixture.whenStable();
    await type('entry-title', 'Il y a un parking ?');
    await type('entry-content', 'Le parking Jaurès est à deux minutes.');
    click('entry-save');

    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith(BASE));
    expect(req.request.body).toEqual({
      title: 'Il y a un parking ?',
      content: 'Le parking Jaurès est à deux minutes.',
    });
    req.flush({
      id: 'e2',
      title: 'Il y a un parking ?',
      content: 'Le parking Jaurès est à deux minutes.',
      source: 'manual',
      createdAt: '2026-10-02T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
    });
    await fixture.whenStable();

    expect(byTestId('entry-form')).toBeNull();
    expect(el().querySelectorAll('[data-testid^="entry-e"]')[0].textContent).toContain('parking');
  });

  it('ajouter : les erreurs de champ du back sont affichées sous le champ', async () => {
    await render([], []);
    click('entry-add');
    await fixture.whenStable();
    await type('entry-title', 'Sujet');
    await type('entry-content', 'Contenu');
    click('entry-save');

    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith(BASE))
      .flush(
        { error: 'Bad Request', fieldErrors: { content: 'size must be between 0 and 2000' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect(byTestId('content-error')?.textContent).toContain('2000 caractères maximum.');
    expect(byTestId('entry-form')).not.toBeNull();
  });

  it('ajouter : une panne du service d’embeddings dit que rien n’a été enregistré', async () => {
    await render([], []);
    click('entry-add');
    await fixture.whenStable();
    await type('entry-title', 'Sujet');
    await type('entry-content', 'Contenu');
    click('entry-save');

    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith(BASE))
      .flush({ error: 'embedding_unavailable' }, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    expect(byTestId('form-error')?.textContent).toContain("Rien n'a été enregistré");
  });

  it('modifier : PUT la fiche et remplace la ligne', async () => {
    await render([], ENTRIES);
    click('entry-edit-e1');
    await fixture.whenStable();
    await type('entry-content', 'Oui, chauffée jusqu’à fin octobre.');
    click('entry-save');

    const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith(`${BASE}/e1`));
    expect(req.request.body.title).toBe('Vous avez une terrasse ?');
    req.flush({ ...ENTRIES[0], content: 'Oui, chauffée jusqu’à fin octobre.' });
    await fixture.whenStable();

    expect(byTestId('entry-e1')?.textContent).toContain('chauffée');
  });

  it('supprimer : demande confirmation, puis DELETE et retire la ligne', async () => {
    await render([], ENTRIES);
    click('entry-delete-e1');

    expect(confirm.ask).toHaveBeenCalled();
    const req = http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith(`${BASE}/e1`));
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(byTestId('entry-e1')).toBeNull();
  });

  it('tester : affiche la fiche la plus proche, sa source et sa proximité', async () => {
    await render([], ENTRIES);
    await type('test-question', 'vous avez une terrasse ?');
    click('test-run');

    const req = http.expectOne((r) => r.url.endsWith(`${BASE}/search`));
    expect(req.request.body).toEqual({ question: 'vous avez une terrasse ?' });
    req.flush({
      question: 'vous avez une terrasse ?',
      matches: [
        {
          id: 'e1',
          title: 'Vous avez une terrasse ?',
          content: 'Oui, vingt couverts.',
          score: 0.83,
        },
      ],
    });
    await fixture.whenStable();

    expect(byTestId('test-result')?.textContent).toContain('Oui, vingt couverts.');
    expect(byTestId('test-result')?.textContent).toContain('proximité 83 %');
  });

  it('tester : dit clairement quand rien ne correspond', async () => {
    await render([], []);
    await type('test-question', 'vous livrez ?');
    click('test-run');

    http
      .expectOne((r) => r.url.endsWith(`${BASE}/search`))
      .flush({ question: 'vous livrez ?', matches: [] });
    await fixture.whenStable();

    expect(byTestId('test-empty')?.textContent).toContain('ne trouverait rien');
  });

  it('sans restaurant : invite à configurer, aucune requête', async () => {
    restaurantId.set(null);
    fixture = TestBed.createComponent(AssistantKnowledgePage);
    await fixture.whenStable();

    expect(el().textContent).toContain("Aucun restaurant n'est rattaché");
  });
});
