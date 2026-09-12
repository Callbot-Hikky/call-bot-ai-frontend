import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  catchError,
  defer,
  delay,
  from,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '@env/environment';
import { MenuDto, PublicMenuDto, mapMenu, mapPublicMenu } from '@core/models/menu-dto.model';
import {
  DEFAULT_LIMITS,
  FILE_TYPE_MIME,
  MENU_ERROR_MESSAGES,
  ManualMenu,
  Menu,
  MenuFile,
  MenuFileType,
  MenuMode,
  PublicMenu,
  detectFileType,
  emptyManual,
  menuErrorMessage,
  validateManual,
} from '@core/models/menu.model';

export type SaveState = 'saved' | 'saving' | 'dirty' | 'failed';

const AUTOSAVE_MS = 600;
const LOAD_FAILED = 'Impossible de charger le menu.';
const SAVE_FAILED = "L'enregistrement a échoué. Vérifiez votre connexion et réessayez.";
const UPLOAD_FAILED = "L'envoi du fichier a échoué. Vérifiez votre connexion et réessayez.";

// Menu du restaurateur. Mock-first : en mode mock l'etat vit en memoire avec les
// memes regles que le back ; en mode reel le back est la source de verite et
// chaque reponse remplace l'etat. Les fichiers sont verifies COTE CLIENT avant
// tout envoi (type sur les octets, taille, nombre) : le back reste la garantie.
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/restaurants`;

  private readonly _menu = signal<Menu | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);
  private readonly _saving = signal(false);
  private readonly _saveState = signal<SaveState>('saved');
  private readonly _lastError = signal<string | null>(null);
  private readonly _touched = signal(false);

  readonly menu = this._menu.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly saveState = this._saveState.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  // Vrai des la premiere modification de la saisie : l'etat d'enregistrement n'a de sens qu'apres.
  readonly touched = this._touched.asReadonly();

  private restaurantId: string | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingManual: ManualMenu | null = null;
  private mockState: Menu | null = null;

  load(restaurantId: string): void {
    this.restaurantId = restaurantId;
    // Chaque visite repart du serveur : pas de brouillon seme depuis une visite precedente.
    this._menu.set(null);
    this._loading.set(true);
    this._error.set(false);
    this.fetch(restaurantId).subscribe({
      next: (menu) => {
        this._menu.set(menu);
        this._loading.set(false);
      },
      error: () => {
        this._error.set(true);
        this._lastError.set(LOAD_FAILED);
        this._loading.set(false);
      },
    });
  }

  // Le mode seul : le back conserve la saisie quand `manual` est absent.
  // Un refus ici ne concerne pas la saisie : l'étiquette d'état de la saisie ne bouge pas.
  setMode(mode: MenuMode): Observable<Menu> {
    // Une saisie en attente part avec le mode : deux envois croises ne peuvent pas se defaire.
    const pending = this.takePendingManual();
    return pending ? this.put({ mode, manual: pending }, true) : this.put({ mode }, false);
  }

  private takePendingManual(): ManualMenu | null {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    const pending = this.pendingManual;
    this.pendingManual = null;
    return pending;
  }

  // Appele en quittant la page : la saisie en attente part tout de suite.
  flushManualSave(): void {
    const pending = this.takePendingManual();
    if (pending) {
      this.saveManual(pending).subscribe({ next: () => undefined, error: () => undefined });
    }
  }

  saveManual(manual: ManualMenu): Observable<Menu> {
    // Un enregistrement explicite remplace l'autosave en attente : pas de double envoi.
    this.takePendingManual();
    const errors = validateManual(manual);
    if (errors.length > 0) {
      this._saveState.set('failed');
      this._lastError.set(errors[0]);
      return throwError(() => new Error(errors[0]));
    }
    // Une carte saisie videe ne peut plus etre publiee : on depublie au lieu d'echouer en boucle.
    const current = this._menu()?.mode ?? 'none';
    const mode = current === 'manual' && manual.sections.length === 0 ? 'none' : current;
    return this.put({ mode, manual }, true);
  }

  // Autosave : chaque frappe repousse l'envoi de 600 ms. L'etat affiche dit la verite :
  // « a enregistrer » tant que l'envoi n'est pas parti, puis « en cours », puis le resultat.
  scheduleManualSave(manual: ManualMenu): void {
    this._touched.set(true);
    this._saveState.set('dirty');
    this.pendingManual = manual;
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.pendingManual = null;
      this.saveManual(manual).subscribe({ next: () => undefined, error: () => undefined });
    }, AUTOSAVE_MS);
  }

  upload(file: File): Observable<Menu> {
    return defer(() => from(this.precheck(file))).pipe(
      switchMap((type) => {
        this._saving.set(true);
        if (environment.useMock) {
          return this.mockUpload(file, type);
        }
        const form = new FormData();
        form.append('file', file);
        return this.http.post<MenuDto>(`${this.menuUrl()}/files`, form).pipe(map(mapMenu));
      }),
      tap((menu) => this.accept(menu)),
      catchError((err) => this.reject(err, UPLOAD_FAILED)),
    );
  }

  removeFile(fileId: string): Observable<Menu> {
    this._saving.set(true);
    const req$ = environment.useMock
      ? this.mockRemove(fileId)
      : this.http.delete<MenuDto>(`${this.menuUrl()}/files/${fileId}`).pipe(map(mapMenu));
    return req$.pipe(
      tap((menu) => this.accept(menu)),
      catchError((err) => this.reject(err, SAVE_FAILED)),
    );
  }

  reorder(fileIds: string[]): Observable<Menu> {
    this._saving.set(true);
    const req$ = environment.useMock
      ? this.mockReorder(fileIds)
      : this.http.put<MenuDto>(`${this.menuUrl()}/files/order`, { fileIds }).pipe(map(mapMenu));
    return req$.pipe(
      tap((menu) => this.accept(menu)),
      catchError((err) => this.reject(err, SAVE_FAILED)),
    );
  }

  // Lecture publique : sans session, ne touche pas a l'etat admin de ce service.
  getPublic(restaurantId: string): Observable<PublicMenu> {
    if (environment.useMock) {
      const state = this.mockMenu(restaurantId);
      const kind = state.mode === 'pdf' ? 'pdf' : state.mode === 'images' ? 'image' : null;
      return of({
        restaurantName: 'Le Bistrot du Coin',
        mode: state.mode,
        manual: state.mode === 'manual' ? state.manual : null,
        files: kind ? state.files.filter((f) => f.kind === kind) : [],
      }).pipe(delay(300));
    }
    return this.http
      .get<PublicMenuDto>(`${environment.apiUrl}/public/restaurants/${restaurantId}/menu`)
      .pipe(map(mapPublicMenu));
  }

  // --- interne ---------------------------------------------------------------

  private fetch(restaurantId: string): Observable<Menu> {
    if (environment.useMock) {
      return of(this.mockMenu(restaurantId)).pipe(delay(300));
    }
    return this.http.get<MenuDto>(`${this.baseUrl}/${restaurantId}/menu`).pipe(map(mapMenu));
  }

  private put(
    body: { mode: MenuMode; manual?: ManualMenu },
    tracksSaveState: boolean,
  ): Observable<Menu> {
    this._saving.set(true);
    if (tracksSaveState) {
      this._saveState.set('saving');
    }
    const req$ = environment.useMock
      ? this.mockPut(body)
      : this.http.put<MenuDto>(this.menuUrl(), body).pipe(map(mapMenu));
    return req$.pipe(
      tap((menu) => this.accept(menu, tracksSaveState)),
      catchError((err) => this.reject(err, SAVE_FAILED, tracksSaveState)),
    );
  }

  private accept(menu: Menu, tracksSaveState = false): void {
    this._menu.set(menu);
    this._saving.set(false);
    if (tracksSaveState) {
      this._saveState.set('saved');
      this._lastError.set(null);
    }
  }

  private reject(err: unknown, fallback: string, tracksSaveState = false): Observable<never> {
    this._saving.set(false);
    if (tracksSaveState) {
      this._saveState.set('failed');
    }
    const message =
      err instanceof HttpErrorResponse
        ? menuErrorMessage(err, fallback)
        : err instanceof Error
          ? err.message
          : fallback;
    this._lastError.set(message);
    return throwError(() => new Error(message));
  }

  private menuUrl(): string {
    return `${this.baseUrl}/${this.restaurantId}/menu`;
  }

  // Verifications cote client, memes regles que le back : type sur les octets de
  // tete (jamais sur l'extension), taille par type, nombre d'images.
  private async precheck(file: File): Promise<MenuFileType> {
    const limits = this._menu()?.limits ?? DEFAULT_LIMITS;
    const type = detectFileType(await readHead(file));
    if (!type) {
      throw new Error(MENU_ERROR_MESSAGES['unsupported_file_type']);
    }
    const max = type === 'pdf' ? limits.pdfMaxBytes : limits.imageMaxBytes;
    if (file.size > max) {
      throw new Error(MENU_ERROR_MESSAGES['file_too_large']);
    }
    if (type !== 'pdf') {
      const images = this._menu()?.files.filter((f) => f.kind === 'image').length ?? 0;
      if (images >= limits.imageMaxCount) {
        throw new Error(MENU_ERROR_MESSAGES['too_many_files']);
      }
    }
    return type;
  }

  // --- mode mock : memes regles que le back, en memoire --------------------------

  private mockMenu(restaurantId: string): Menu {
    if (!this.mockState || this.mockState.restaurantId !== restaurantId) {
      this.mockState = {
        restaurantId,
        mode: 'none',
        manual: emptyManual(),
        files: [],
        limits: DEFAULT_LIMITS,
      };
    }
    return structuredClone(this.mockState);
  }

  private mockPut(body: { mode: MenuMode; manual?: ManualMenu }): Observable<Menu> {
    const state = this.mockMenu(this.restaurantId ?? '');
    const manual = body.manual ?? state.manual;
    const ready =
      body.mode === 'pdf'
        ? state.files.some((f) => f.kind === 'pdf')
        : body.mode === 'images'
          ? state.files.some((f) => f.kind === 'image')
          : body.mode === 'manual'
            ? manual.sections.length > 0
            : true;
    if (!ready) {
      return throwError(
        () => new HttpErrorResponse({ status: 409, error: { error: 'mode_not_ready' } }),
      ).pipe(delay(200));
    }
    this.mockState = { ...state, mode: body.mode, manual };
    return of(structuredClone(this.mockState)).pipe(delay(200));
  }

  // Le type vient des octets (precheck), jamais du Content-Type annonce par le navigateur.
  private mockUpload(file: File, type: MenuFileType): Observable<Menu> {
    const state = this.mockMenu(this.restaurantId ?? '');
    const kind = type === 'pdf' ? 'pdf' : 'image';
    const siblings = state.files.filter((f) => f.kind === kind);
    const created: MenuFile = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      contentType: FILE_TYPE_MIME[type],
      position: (siblings.at(-1)?.position ?? -1) + 1,
      sizeBytes: file.size,
      url: objectUrl(file),
    };
    this.mockState = { ...state, files: [...state.files, created] };
    return of(structuredClone(this.mockState)).pipe(delay(300));
  }

  private mockRemove(fileId: string): Observable<Menu> {
    const state = this.mockMenu(this.restaurantId ?? '');
    const removed = state.files.find((f) => f.id === fileId);
    if (removed?.url.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }
    const files = state.files.filter((f) => f.id !== fileId);
    let position = 0;
    const renumbered = files.map((f) => (f.kind === 'image' ? { ...f, position: position++ } : f));
    const stillPublished =
      removed &&
      ((state.mode === 'pdf' && removed.kind === 'pdf') ||
        (state.mode === 'images' && removed.kind === 'image'))
        ? renumbered.some((f) => f.kind === removed.kind)
        : true;
    this.mockState = { ...state, files: renumbered, mode: stillPublished ? state.mode : 'none' };
    return of(structuredClone(this.mockState)).pipe(delay(200));
  }

  private mockReorder(fileIds: string[]): Observable<Menu> {
    const state = this.mockMenu(this.restaurantId ?? '');
    const files = state.files.map((f) =>
      f.kind === 'image' ? { ...f, position: fileIds.indexOf(f.id) } : f,
    );
    files.sort((a, b) => a.position - b.position);
    this.mockState = { ...state, files };
    return of(structuredClone(this.mockState)).pipe(delay(200));
  }
}

async function readHead(file: File): Promise<Uint8Array> {
  const head = file.slice(0, 12);
  if (typeof head.arrayBuffer === 'function') {
    return new Uint8Array(await head.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(head);
  });
}

// Apercu local en mode mock ; absent en environnement de test (jsdom).
function objectUrl(file: File): string {
  try {
    return URL.createObjectURL(file);
  } catch {
    return `blob:mock/${file.name}`;
  }
}
