import { HttpErrorResponse } from '@angular/common/http';

// Ce que le restaurateur apprend à l'assistant vocal : du texte libre, retrouvé par
// similarité avec la question du client. Les formes suivent le contrat du back.

export type KnowledgeSource = 'manual' | 'import' | 'unanswered';

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: KnowledgeSource;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntryDraft {
  title: string;
  content: string;
}

export interface KnowledgeMatch {
  id: string;
  title: string;
  content: string;
  // Similarité cosinus : 1 = même sens, 0 = sans rapport.
  score: number;
}

export interface KnowledgeSearchResult {
  question: string;
  matches: KnowledgeMatch[];
}

export interface UnansweredQuestion {
  id: string;
  question: string;
  askedCount: number;
  lastAskedAt: string;
  status: 'open' | 'answered' | 'ignored';
}

// Bornes imposées par le back : les passages sont injectés dans un petit modèle.
export const KNOWLEDGE_LIMITS = { title: 200, content: 2000, question: 500 } as const;

export type KnowledgeFieldErrors = Partial<Record<'title' | 'content' | 'answer', string>>;

interface ApiErrorBody {
  error?: string;
  fieldErrors?: Record<string, string> | null;
}

function bodyOf(err: unknown): ApiErrorBody | null {
  return err instanceof HttpErrorResponse ? ((err.error as ApiErrorBody | null) ?? null) : null;
}

/** Les erreurs de champ d'un 400, telles que le back les renvoie. Vide sinon. */
export function knowledgeFieldErrors(err: unknown): KnowledgeFieldErrors {
  if (!(err instanceof HttpErrorResponse) || err.status !== 400) {
    return {};
  }
  return (bodyOf(err)?.fieldErrors as KnowledgeFieldErrors | null | undefined) ?? {};
}

/**
 * Message à afficher pour une écriture refusée. Le 502 `embedding_unavailable` mérite
 * sa propre phrase : rien n'a été enregistré, et réessayer plus tard suffit.
 */
export function knowledgeErrorMessage(err: unknown, fallback: string): string {
  const code = bodyOf(err)?.error;
  if (code === 'embedding_unavailable') {
    return "Le service qui prépare les réponses de l'assistant est indisponible. Rien n'a été enregistré : réessayez dans un instant.";
  }
  if (code === 'question_already_handled') {
    return 'Cette question a déjà été traitée.';
  }
  return fallback;
}

/** « Posée 3 fois », « Posée 1 fois ». */
export function askedLabel(count: number): string {
  return `Posée ${count} fois`;
}

/** Score de similarité en pourcentage entier, pour l'affichage. */
export function scorePercent(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
