import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import type {
  KnowledgeEntry,
  KnowledgeEntryDraft,
  KnowledgeSearchResult,
  UnansweredQuestion,
} from '@core/models/knowledge.model';

/**
 * Côté restaurateur : ce que l'assistant vocal sait, et ce qu'il n'a pas su dire.
 * Le back calcule les embeddings ; ici on n'échange que du texte.
 */
@Injectable({ providedIn: 'root' })
export class KnowledgeService {
  private readonly http = inject(HttpClient);

  private base(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${restaurantId}/knowledge`;
  }

  getEntries(restaurantId: string): Observable<KnowledgeEntry[]> {
    return this.http.get<KnowledgeEntry[]>(this.base(restaurantId));
  }

  createEntry(restaurantId: string, draft: KnowledgeEntryDraft): Observable<KnowledgeEntry> {
    return this.http.post<KnowledgeEntry>(this.base(restaurantId), draft);
  }

  updateEntry(
    restaurantId: string,
    entryId: string,
    draft: KnowledgeEntryDraft,
  ): Observable<KnowledgeEntry> {
    return this.http.put<KnowledgeEntry>(`${this.base(restaurantId)}/${entryId}`, draft);
  }

  deleteEntry(restaurantId: string, entryId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(restaurantId)}/${entryId}`);
  }

  // « Tester l'assistant » : les mêmes passages que ceux qu'il recevrait pendant un appel.
  search(restaurantId: string, question: string): Observable<KnowledgeSearchResult> {
    return this.http.post<KnowledgeSearchResult>(`${this.base(restaurantId)}/search`, {
      question,
    });
  }

  // Questions posées au téléphone restées sans réponse, les plus posées d'abord.
  getOpenQuestions(restaurantId: string): Observable<UnansweredQuestion[]> {
    return this.http.get<UnansweredQuestion[]>(`${this.base(restaurantId)}/questions`);
  }

  // La réponse devient une entrée de la base : le back renvoie cette entrée.
  answerQuestion(
    restaurantId: string,
    questionId: string,
    answer: string,
  ): Observable<KnowledgeEntry> {
    return this.http.post<KnowledgeEntry>(
      `${this.base(restaurantId)}/questions/${questionId}/answer`,
      { answer },
    );
  }

  ignoreQuestion(restaurantId: string, questionId: string): Observable<void> {
    return this.http.post<void>(`${this.base(restaurantId)}/questions/${questionId}/ignore`, {});
  }
}
