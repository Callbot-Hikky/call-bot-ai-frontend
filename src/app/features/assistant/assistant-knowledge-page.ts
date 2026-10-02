import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmTextarea } from '@spartan-ng/helm/textarea';

import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkSectionHeader } from '@shared/components/molecules/section-header/hk-section-header';
import { HkEmptyState } from '@shared/components/molecules/empty-state/hk-empty-state';
import { ConfirmService } from '@shared/components/molecules/confirm-dialog/hk-confirm-dialog';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkCard } from '@shared/components/atoms/card/hk-card';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkInput } from '@shared/components/atoms/input/hk-input';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { KnowledgeService } from '@core/services/knowledge.service';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import {
  KNOWLEDGE_LIMITS,
  KnowledgeEntry,
  KnowledgeFieldErrors,
  KnowledgeSearchResult,
  UnansweredQuestion,
  askedLabel,
  knowledgeErrorMessage,
  knowledgeFieldErrors,
  scorePercent,
} from '@core/models/knowledge.model';

type LoadState = 'loading' | 'ready' | 'error';
type TestState = 'idle' | 'loading' | 'done' | 'error';

// Le back valide en anglais (Bean Validation) : on traduit les deux messages attendus,
// et on affiche tel quel tout message qu'on ne connaît pas plutôt que de le masquer.
function translateFieldError(message: string | undefined, max: number): string | null {
  if (!message) {
    return null;
  }
  if (message.includes('blank')) {
    return 'Ce champ est obligatoire.';
  }
  if (message.includes('size')) {
    return `${max} caractères maximum.`;
  }
  return message;
}

// Page « Assistant » du restaurateur : répondre aux questions restées sans réponse au
// téléphone, tenir à jour ce que l'assistant sait, et vérifier ce qu'il retrouverait.
// L'assistant ne dit que ce qui est écrit ici : aucun texte ne vient des clients.
@Component({
  selector: 'app-assistant-knowledge',
  imports: [
    HkPageHeader,
    HkSectionHeader,
    HkEmptyState,
    HkButton,
    HkCard,
    HkIcon,
    HkInput,
    HkSkeleton,
    HlmTextarea,
    RouterLink,
  ],
  template: `
    <hk-page-header
      subtitle="Répondez aux questions que vos clients posent au téléphone. L'assistant s'en sert pendant l'appel, et ne dit jamais rien que vous n'avez pas validé."
    />

    @if (!restaurantId()) {
      <div class="bg-card border-border/70 rounded-lg border p-10 text-center shadow-md">
        <p class="text-text-strong font-medium">Aucun restaurant n'est rattaché à votre compte.</p>
        <p class="text-muted-foreground text-sm">
          Terminez d'abord la configuration de votre restaurant.
        </p>
        <a routerLink="/mon-restaurant" class="text-primary mt-3 inline-block text-sm underline">
          Configurer mon restaurant
        </a>
      </div>
    } @else {
      <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div class="flex flex-col gap-6 lg:col-span-2">
          <!-- 1. Les questions restées sans réponse : le travail le plus utile, donc en premier. -->
          <hk-card data-testid="questions-card">
            <hk-section-header
              title="À répondre"
              subtitle="Des clients ont posé ces questions au téléphone. L'assistant n'a pas su répondre."
            >
              @if (questionsState() === 'ready' && questions().length > 0) {
                <span
                  class="bg-st-pending-bg text-st-pending-fg inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                  data-testid="questions-count"
                >
                  {{ questions().length }} en attente
                </span>
              }
            </hk-section-header>

            @switch (questionsState()) {
              @case ('loading') {
                <div class="flex flex-col gap-3" aria-busy="true">
                  <hk-skeleton height="3rem" />
                  <hk-skeleton height="3rem" />
                </div>
              }
              @case ('error') {
                <div class="flex flex-col items-start gap-3" data-testid="questions-error">
                  <p class="text-muted-foreground text-sm">
                    Impossible de charger les questions. Vérifiez votre connexion et réessayez.
                  </p>
                  <hk-button size="sm" variant="secondary" (click)="loadQuestions()">
                    <hk-icon name="lucideRefreshCw" [size]="14" />
                    Réessayer
                  </hk-button>
                </div>
              }
              @default {
                @if (questions().length === 0) {
                  <hk-empty-state
                    icon="lucideCircleCheck"
                    title="Aucune question en attente"
                    subtitle="Quand un client posera une question à laquelle l'assistant ne sait pas répondre, elle apparaîtra ici."
                  />
                } @else {
                  <ul class="flex flex-col">
                    @for (q of questions(); track q.id) {
                      <li
                        class="border-border flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-0 last:pb-0"
                        [attr.data-testid]="'question-' + q.id"
                      >
                        <div class="flex flex-col gap-0.5">
                          <p class="text-text-strong font-medium">« {{ q.question }} »</p>
                          <p class="text-muted-foreground text-xs">
                            {{ askedLabel(q.askedCount) }} · la dernière le
                            {{ formatDay(q.lastAskedAt) }}
                          </p>
                        </div>
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <label class="sr-only" [attr.for]="'answer-' + q.id">
                            Votre réponse à « {{ q.question }} »
                          </label>
                          <hk-input
                            class="flex-1"
                            [inputId]="'answer-' + q.id"
                            placeholder="Écrivez comme vous le diriez au téléphone. Une phrase suffit."
                            [value]="answerOf(q.id)"
                            [disabled]="busyQuestion() === q.id"
                            [error]="answerErrorOf(q.id) !== null"
                            (valueChange)="setAnswer(q.id, $event)"
                          />
                          <div class="flex gap-2">
                            <hk-button
                              size="sm"
                              [attr.data-testid]="'answer-save-' + q.id"
                              [disabled]="busyQuestion() === q.id || !canAnswer(q.id)"
                              (click)="answer(q)"
                            >
                              Enregistrer
                            </hk-button>
                            <hk-button
                              size="sm"
                              variant="ghost"
                              [attr.data-testid]="'answer-ignore-' + q.id"
                              [disabled]="busyQuestion() === q.id"
                              (click)="ignore(q)"
                            >
                              Ignorer
                            </hk-button>
                          </div>
                        </div>
                        @if (answerErrorOf(q.id); as message) {
                          <p class="text-st-cancelled-fg text-xs" role="alert">{{ message }}</p>
                        }
                      </li>
                    }
                  </ul>
                }
              }
            }
          </hk-card>

          <!-- 2. Tout ce que l'assistant sait, et la seule porte pour le lui apprendre. -->
          <hk-card data-testid="entries-card">
            <hk-section-header
              title="Ce que l'assistant sait"
              subtitle="Accès, allergènes, animaux, menu enfant… Une information par fiche, en une ou deux phrases."
            >
              @if (editing() === null && entriesState() === 'ready') {
                <hk-button size="sm" data-testid="entry-add" (click)="startCreate()">
                  <hk-icon name="lucidePlus" [size]="14" />
                  Ajouter une information
                </hk-button>
              }
            </hk-section-header>

            @if (editing() !== null) {
              <form
                class="border-border mb-4 flex flex-col gap-3 rounded-md border p-4"
                data-testid="entry-form"
                (submit)="$event.preventDefault(); save()"
              >
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium" for="entry-title">Sujet</label>
                  <hk-input
                    inputId="entry-title"
                    placeholder="Ex. : Vous avez une terrasse ?"
                    [value]="draftTitle()"
                    [disabled]="saving()"
                    [error]="titleError() !== null"
                    (valueChange)="draftTitle.set($event)"
                  />
                  @if (titleError(); as message) {
                    <p class="text-st-cancelled-fg text-xs" role="alert" data-testid="title-error">
                      {{ message }}
                    </p>
                  } @else {
                    <p class="text-muted-foreground text-xs">
                      La question, formulée comme un client la poserait.
                    </p>
                  }
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium" for="entry-content"
                    >Ce que l'assistant dira</label
                  >
                  <textarea
                    hlmTextarea
                    id="entry-content"
                    rows="3"
                    class="text-sm"
                    placeholder="Ex. : Oui, vingt couverts, chauffée jusqu'à fin octobre."
                    [attr.maxlength]="limits.content"
                    [value]="draftContent()"
                    [disabled]="saving()"
                    (input)="setContent($event)"
                  ></textarea>
                  <div class="flex items-start justify-between gap-3">
                    @if (contentError(); as message) {
                      <p
                        class="text-st-cancelled-fg text-xs"
                        role="alert"
                        data-testid="content-error"
                      >
                        {{ message }}
                      </p>
                    } @else {
                      <span></span>
                    }
                    <span class="text-text-subtle text-xs tabular-nums">
                      {{ draftContent().length }}/{{ limits.content }}
                    </span>
                  </div>
                </div>
                @if (formError(); as message) {
                  <p class="text-st-cancelled-fg text-sm" role="alert" data-testid="form-error">
                    {{ message }}
                  </p>
                }
                <div class="flex gap-2">
                  <hk-button
                    size="sm"
                    type="submit"
                    data-testid="entry-save"
                    [disabled]="saving() || !canSave()"
                  >
                    {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
                  </hk-button>
                  <hk-button
                    size="sm"
                    variant="ghost"
                    data-testid="entry-cancel"
                    [disabled]="saving()"
                    (click)="cancelEdit()"
                  >
                    Annuler
                  </hk-button>
                </div>
              </form>
            }

            @switch (entriesState()) {
              @case ('loading') {
                <div class="flex flex-col gap-3" aria-busy="true">
                  <hk-skeleton height="2.5rem" />
                  <hk-skeleton height="2.5rem" />
                  <hk-skeleton height="2.5rem" />
                </div>
              }
              @case ('error') {
                <div class="flex flex-col items-start gap-3" data-testid="entries-error">
                  <p class="text-muted-foreground text-sm">
                    Impossible de charger ce que l'assistant sait. Vérifiez votre connexion et
                    réessayez.
                  </p>
                  <hk-button size="sm" variant="secondary" (click)="loadEntries()">
                    <hk-icon name="lucideRefreshCw" [size]="14" />
                    Réessayer
                  </hk-button>
                </div>
              }
              @default {
                @if (entries().length === 0 && editing() === null) {
                  <hk-empty-state
                    icon="lucideFileText"
                    title="L'assistant ne sait encore rien de particulier"
                    subtitle="Il connaît déjà vos horaires. Ajoutez ce que vos clients demandent souvent."
                  />
                } @else {
                  <ul class="flex flex-col">
                    @for (entry of entries(); track entry.id) {
                      <li
                        class="border-border flex flex-col gap-2 border-t py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                        [attr.data-testid]="'entry-' + entry.id"
                      >
                        <div class="flex min-w-0 flex-col gap-0.5">
                          <p class="text-text-strong text-sm font-medium">{{ entry.title }}</p>
                          <p class="text-muted-foreground text-sm">{{ entry.content }}</p>
                          @if (entry.source === 'unanswered') {
                            <span class="text-text-subtle text-xs">
                              Réponse à une question posée au téléphone
                            </span>
                          }
                        </div>
                        <div class="flex shrink-0 gap-1">
                          <hk-button
                            size="sm"
                            variant="ghost"
                            [attr.data-testid]="'entry-edit-' + entry.id"
                            [disabled]="saving()"
                            (click)="startEdit(entry)"
                          >
                            Modifier
                          </hk-button>
                          <hk-button
                            size="sm"
                            variant="ghost"
                            [attr.data-testid]="'entry-delete-' + entry.id"
                            [disabled]="saving()"
                            (click)="remove(entry)"
                          >
                            Supprimer
                          </hk-button>
                        </div>
                      </li>
                    }
                  </ul>
                }
              }
            }
          </hk-card>
        </div>

        <!-- 3. Vérifier : la même recherche que celle de l'assistant pendant un appel. -->
        <hk-card data-testid="test-card">
          <hk-section-header
            title="Tester l'assistant"
            subtitle="Posez une question comme un client. Vous voyez sur quelle information il s'appuierait."
          />
          <form class="flex items-center gap-2" (submit)="$event.preventDefault(); runTest()">
            <label class="sr-only" for="test-question">Question à tester</label>
            <hk-input
              class="flex-1"
              inputId="test-question"
              icon="lucideSearch"
              placeholder="Vous avez une terrasse ?"
              [value]="testQuestion()"
              (valueChange)="testQuestion.set($event)"
            />
            <hk-button
              size="sm"
              type="submit"
              data-testid="test-run"
              [disabled]="testState() === 'loading' || !canTest()"
            >
              Tester
            </hk-button>
          </form>

          <div class="mt-4" aria-live="polite">
            @switch (testState()) {
              @case ('loading') {
                <hk-skeleton height="4rem" />
              }
              @case ('error') {
                <p class="text-st-cancelled-fg text-sm" data-testid="test-error">
                  {{ testError() }}
                </p>
              }
              @case ('done') {
                @if (topMatch(); as match) {
                  <div
                    class="bg-muted flex flex-col gap-2 rounded-md p-4"
                    data-testid="test-result"
                  >
                    <p class="text-muted-foreground text-xs font-medium">
                      L'assistant répondrait à partir de
                    </p>
                    <p class="text-text-strong text-sm">« {{ match.content }} »</p>
                    <p class="text-text-subtle text-xs">
                      Source : « {{ match.title }} » · proximité {{ scorePercent(match.score) }} %
                    </p>
                  </div>
                } @else {
                  <p class="text-muted-foreground text-sm" data-testid="test-empty">
                    L'assistant ne trouverait rien pour cette question. Ajoutez l'information dans «
                    Ce que l'assistant sait ».
                  </p>
                }
              }
            }
          </div>
        </hk-card>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantKnowledgePage {
  private readonly knowledge = inject(KnowledgeService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly restaurantId = this.session.restaurantId;
  protected readonly limits = KNOWLEDGE_LIMITS;
  protected readonly askedLabel = askedLabel;
  protected readonly scorePercent = scorePercent;

  protected readonly questions = signal<readonly UnansweredQuestion[]>([]);
  protected readonly questionsState = signal<LoadState>('loading');
  private readonly answers = signal<Record<string, string>>({});
  private readonly answerErrors = signal<Record<string, string>>({});
  protected readonly busyQuestion = signal<string | null>(null);

  protected readonly entries = signal<readonly KnowledgeEntry[]>([]);
  protected readonly entriesState = signal<LoadState>('loading');
  // null = formulaire fermé, 'new' = création, sinon l'identifiant de l'entrée modifiée.
  protected readonly editing = signal<string | null>(null);
  protected readonly draftTitle = signal('');
  protected readonly draftContent = signal('');
  private readonly fieldErrors = signal<KnowledgeFieldErrors>({});
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly testQuestion = signal('');
  protected readonly testState = signal<TestState>('idle');
  protected readonly testError = signal('');
  private readonly testResult = signal<KnowledgeSearchResult | null>(null);
  protected readonly topMatch = computed(() => this.testResult()?.matches[0] ?? null);

  protected readonly titleError = computed(() => {
    if (this.draftTitle().length > KNOWLEDGE_LIMITS.title) {
      return `${KNOWLEDGE_LIMITS.title} caractères maximum.`;
    }
    return translateFieldError(this.fieldErrors().title, KNOWLEDGE_LIMITS.title);
  });
  protected readonly contentError = computed(() =>
    translateFieldError(this.fieldErrors().content, KNOWLEDGE_LIMITS.content),
  );
  protected readonly canSave = computed(
    () =>
      this.draftTitle().trim().length > 0 &&
      this.draftTitle().length <= KNOWLEDGE_LIMITS.title &&
      this.draftContent().trim().length > 0,
  );
  protected readonly canTest = computed(() => {
    const length = this.testQuestion().trim().length;
    return length > 0 && length <= KNOWLEDGE_LIMITS.question;
  });

  constructor() {
    // Recharge quand le restaurant courant change (compte à plusieurs établissements).
    effect(() => {
      if (this.restaurantId()) {
        untracked(() => {
          this.loadQuestions();
          this.loadEntries();
        });
      }
    });
  }

  protected loadQuestions(): void {
    const restaurantId = this.restaurantId();
    if (!restaurantId) {
      return;
    }
    this.questionsState.set('loading');
    this.knowledge
      .getOpenQuestions(restaurantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (questions) => {
          this.questions.set(questions);
          this.questionsState.set('ready');
        },
        error: () => this.questionsState.set('error'),
      });
  }

  protected loadEntries(): void {
    const restaurantId = this.restaurantId();
    if (!restaurantId) {
      return;
    }
    this.entriesState.set('loading');
    this.knowledge
      .getEntries(restaurantId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entries) => {
          this.entries.set(entries);
          this.entriesState.set('ready');
        },
        error: () => this.entriesState.set('error'),
      });
  }

  protected answerOf(questionId: string): string {
    return this.answers()[questionId] ?? '';
  }

  protected answerErrorOf(questionId: string): string | null {
    return this.answerErrors()[questionId] ?? null;
  }

  protected setAnswer(questionId: string, value: string): void {
    this.answers.update((all) => ({ ...all, [questionId]: value }));
    this.clearAnswerError(questionId);
  }

  protected canAnswer(questionId: string): boolean {
    const length = this.answerOf(questionId).trim().length;
    return length > 0 && length <= KNOWLEDGE_LIMITS.content;
  }

  /** La réponse devient une fiche : la question quitte la liste, la fiche rejoint l'autre. */
  protected answer(question: UnansweredQuestion): void {
    const restaurantId = this.restaurantId();
    if (!restaurantId || this.busyQuestion() || !this.canAnswer(question.id)) {
      return;
    }
    this.busyQuestion.set(question.id);
    this.knowledge
      .answerQuestion(restaurantId, question.id, this.answerOf(question.id).trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.busyQuestion.set(null);
          this.dropQuestion(question.id);
          this.entries.update((list) => [entry, ...list]);
          this.toast.show(
            "Réponse enregistrée. L'assistant la connaît dès le prochain appel.",
            'success',
          );
        },
        error: (err: unknown) => {
          this.busyQuestion.set(null);
          const field = translateFieldError(
            knowledgeFieldErrors(err).answer,
            KNOWLEDGE_LIMITS.content,
          );
          this.answerErrors.update((all) => ({
            ...all,
            [question.id]:
              field ?? knowledgeErrorMessage(err, "La réponse n'a pas pu être enregistrée."),
          }));
        },
      });
  }

  protected ignore(question: UnansweredQuestion): void {
    const restaurantId = this.restaurantId();
    if (!restaurantId || this.busyQuestion()) {
      return;
    }
    this.busyQuestion.set(question.id);
    this.knowledge
      .ignoreQuestion(restaurantId, question.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyQuestion.set(null);
          this.dropQuestion(question.id);
          this.toast.show('Question écartée.');
        },
        error: (err: unknown) => {
          this.busyQuestion.set(null);
          this.toast.show(
            knowledgeErrorMessage(err, "La question n'a pas pu être écartée."),
            'error',
          );
        },
      });
  }

  protected startCreate(): void {
    this.openForm('new', '', '');
  }

  protected startEdit(entry: KnowledgeEntry): void {
    this.openForm(entry.id, entry.title, entry.content);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.fieldErrors.set({});
    this.formError.set(null);
  }

  protected setContent(event: Event): void {
    this.draftContent.set((event.target as HTMLTextAreaElement).value);
  }

  protected save(): void {
    const restaurantId = this.restaurantId();
    const target = this.editing();
    if (!restaurantId || target === null || this.saving() || !this.canSave()) {
      return;
    }
    const draft = { title: this.draftTitle().trim(), content: this.draftContent().trim() };
    this.saving.set(true);
    this.fieldErrors.set({});
    this.formError.set(null);
    const request =
      target === 'new'
        ? this.knowledge.createEntry(restaurantId, draft)
        : this.knowledge.updateEntry(restaurantId, target, draft);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.entries.update((list) =>
          target === 'new' ? [saved, ...list] : list.map((e) => (e.id === saved.id ? saved : e)),
        );
        this.cancelEdit();
        this.toast.show('Information enregistrée.', 'success');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const fields = knowledgeFieldErrors(err);
        this.fieldErrors.set(fields);
        if (!fields.title && !fields.content) {
          this.formError.set(
            knowledgeErrorMessage(err, "L'information n'a pas pu être enregistrée."),
          );
        }
      },
    });
  }

  protected remove(entry: KnowledgeEntry): void {
    const restaurantId = this.restaurantId();
    if (!restaurantId) {
      return;
    }
    this.confirm
      .ask(
        {
          title: 'Supprimer cette information ?',
          message: `L'assistant ne pourra plus répondre à partir de « ${entry.title} ».`,
          confirmLabel: 'Supprimer',
        },
        this.destroyRef,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.knowledge
          .deleteEntry(restaurantId, entry.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.entries.update((list) => list.filter((e) => e.id !== entry.id));
              if (this.editing() === entry.id) {
                this.cancelEdit();
              }
              this.toast.show('Information supprimée.');
            },
            error: () => this.toast.show("L'information n'a pas pu être supprimée.", 'error'),
          });
      });
  }

  protected runTest(): void {
    const restaurantId = this.restaurantId();
    if (!restaurantId || this.testState() === 'loading' || !this.canTest()) {
      return;
    }
    this.testState.set('loading');
    this.knowledge
      .search(restaurantId, this.testQuestion().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testResult.set(result);
          this.testState.set('done');
        },
        error: (err: unknown) => {
          this.testError.set(knowledgeErrorMessage(err, "Le test n'a pas pu être lancé."));
          this.testState.set('error');
        },
      });
  }

  protected formatDay(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(
      new Date(iso),
    );
  }

  private openForm(target: string, title: string, content: string): void {
    this.editing.set(target);
    this.draftTitle.set(title);
    this.draftContent.set(content);
    this.fieldErrors.set({});
    this.formError.set(null);
  }

  private dropQuestion(questionId: string): void {
    this.questions.update((list) => list.filter((q) => q.id !== questionId));
    this.clearAnswerError(questionId);
  }

  private clearAnswerError(questionId: string): void {
    this.answerErrors.update((all) =>
      Object.fromEntries(Object.entries(all).filter(([id]) => id !== questionId)),
    );
  }
}
