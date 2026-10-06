import { inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MENU_GATEWAY } from './menu-gateway';
import { Observable, catchError, defer, from, switchMap, tap, throwError } from 'rxjs';
import {
  DEFAULT_LIMITS,
  MENU_ERROR_MESSAGES,
  ManualMenu,
  Menu,
  MenuFileType,
  MenuMode,
  PublicMenu,
  detectFileType,
  menuErrorMessage,
  validateManual,
} from '@core/models/menu.model';

export type SaveState = 'saved' | 'saving' | 'dirty' | 'failed';

const AUTOSAVE_MS = 600;
const LOAD_FAILED = 'Impossible de charger le menu.';
const SAVE_FAILED = "L'enregistrement a échoué. Vérifiez votre connexion et réessayez.";
const UPLOAD_FAILED = "L'envoi du fichier a échoué. Vérifiez votre connexion et réessayez.";

// Menu du restaurateur. Ce service ne connait pas le transport : il parle a une
// passerelle (MENU_GATEWAY) et ne garde que l'etat affiche a l'ecran. Chaque
// reponse remplace cet etat, le serveur restant la source de verite. Les fichiers
// sont verifies COTE CLIENT avant tout envoi (type sur les octets, taille,
// nombre) ; ce n'est qu'un filtre de confort, le back reste la garantie.
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly gateway = inject(MENU_GATEWAY);

  private readonly _menu = signal<Menu | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);
  private readonly _saving = signal(false);
  private readonly _saveState = signal<SaveState>('saved');
  private readonly _lastError = signal<string | null>(null);
  private readonly _touched = signal(false);
  private readonly _loadedMenu = signal<Menu | null>(null);

  readonly menu = this._menu.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly saveState = this._saveState.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  // Vrai des la premiere modification de la saisie : l'etat d'enregistrement n'a de sens qu'apres.
  readonly touched = this._touched.asReadonly();
  // La carte telle qu'elle est sortie du serveur, remplacee a chaque chargement et
  // par rien d'autre. C'est le point de depart des brouillons : observer `menu`
  // les ferait repartir de zero a chaque enregistrement, et une cle construite sur
  // l'identifiant du restaurant ne bougerait pas en rechargeant le meme.
  readonly loadedMenu = this._loadedMenu.asReadonly();

  private restaurantId: string | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingManual: ManualMenu | null = null;

  load(restaurantId: string): void {
    this.restaurantId = restaurantId;
    // Chaque visite repart du serveur : pas de brouillon seme depuis une visite precedente.
    this._menu.set(null);
    this._loading.set(true);
    this._error.set(false);
    // Le service est unique pour toute l'application : sans cette remise a zero, une
    // page fraichement ouverte afficherait l'etiquette « Enregistre » ou le message
    // d'echec d'une visite precedente, sur une carte qui n'est pas encore arrivee.
    this.takePendingManual();
    this._saveState.set('saved');
    this._touched.set(false);
    this._lastError.set(null);
    this.fetch(restaurantId).subscribe({
      next: (menu) => {
        this._menu.set(menu);
        this._loadedMenu.set(menu);
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
        return this.gateway.upload(this.requireRestaurantId(), file, type);
      }),
      tap((menu) => this.accept(menu)),
      catchError((err) => this.reject(err, UPLOAD_FAILED)),
    );
  }

  removeFile(fileId: string): Observable<Menu> {
    this._saving.set(true);
    const req$ = this.gateway.removeFile(this.requireRestaurantId(), fileId);
    return req$.pipe(
      tap((menu) => this.accept(menu)),
      catchError((err) => this.reject(err, SAVE_FAILED)),
    );
  }

  reorder(fileIds: string[]): Observable<Menu> {
    this._saving.set(true);
    const req$ = this.gateway.reorder(this.requireRestaurantId(), fileIds);
    return req$.pipe(
      tap((menu) => this.accept(menu)),
      catchError((err) => this.reject(err, SAVE_FAILED)),
    );
  }

  // Lecture publique : sans session, ne touche pas a l'etat admin de ce service.
  getPublic(restaurantId: string): Observable<PublicMenu> {
    return this.gateway.getPublic(restaurantId);
  }

  // --- interne ---------------------------------------------------------------

  private fetch(restaurantId: string): Observable<Menu> {
    return this.gateway.fetch(restaurantId);
  }

  private put(
    body: { mode: MenuMode; manual?: ManualMenu },
    tracksSaveState: boolean,
  ): Observable<Menu> {
    this._saving.set(true);
    if (tracksSaveState) {
      this._saveState.set('saving');
    }
    const req$ = this.gateway.put(this.requireRestaurantId(), body);
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

  // Aucune commande ne doit partir avant que la page ait charge un restaurant :
  // sans cette garde l'appel partirait sur une adresse contenant « null ».
  private requireRestaurantId(): string {
    const id = this.restaurantId;
    if (!id) {
      throw new Error("Aucun restaurant n'est charge.");
    }
    return id;
  }

  // Verifications cote client, memes regles que le back : type sur les octets de
  // tete (jamais sur l'extension), taille par type, nombre de fichiers du meme genre.
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
    const kind = type === 'pdf' ? 'pdf' : 'image';
    const already = this._menu()?.files.filter((f) => f.kind === kind).length ?? 0;
    const maxCount = kind === 'pdf' ? limits.pdfMaxCount : limits.imageMaxCount;
    if (already >= maxCount) {
      throw new Error(MENU_ERROR_MESSAGES['too_many_files']);
    }
    return type;
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
