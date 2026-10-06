import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  DEFAULT_LIMITS,
  FILE_TYPE_MIME,
  Menu,
  MenuFile,
  MenuFileType,
  MenuMode,
  ManualMenu,
  PublicMenu,
  emptyManual,
} from '@core/models/menu.model';
import { MenuGateway } from './menu-gateway';

/**
 * Un faux backend en memoire, pour travailler sans serveur. Il applique les memes
 * regles que le vrai : un mode vide n'est pas publiable, supprimer le dernier
 * fichier depublie, l'ordre ne porte que sur un genre a la fois.
 *
 * Il vit dans son propre fichier et n'est fourni qu'en mode maquette (voir
 * `useMock` dans les environnements) : le service de menu, lui, ne contient
 * aucun branchement entre vrai et faux backend.
 */
@Injectable()
export class InMemoryMenuGateway implements MenuGateway {
  private state: Menu | null = null;

  private snapshot(restaurantId: string): Menu {
    if (!this.state || this.state.restaurantId !== restaurantId) {
      this.state = {
        restaurantId,
        mode: 'none',
        manual: emptyManual(),
        files: [],
        limits: DEFAULT_LIMITS,
      };
    }
    return structuredClone(this.state);
  }

  fetch(restaurantId: string): Observable<Menu> {
    return of(this.snapshot(restaurantId)).pipe(delay(300));
  }

  put(restaurantId: string, body: { mode: MenuMode; manual?: ManualMenu }): Observable<Menu> {
    const state = this.snapshot(restaurantId);
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
    this.state = { ...state, mode: body.mode, manual };
    return of(structuredClone(this.state)).pipe(delay(200));
  }

  // Le type vient des octets, jamais du Content-Type annonce par le navigateur.
  upload(restaurantId: string, file: File, type: MenuFileType): Observable<Menu> {
    const state = this.snapshot(restaurantId);
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
    this.state = { ...state, files: [...state.files, created] };
    return of(structuredClone(this.state)).pipe(delay(300));
  }

  removeFile(restaurantId: string, fileId: string): Observable<Menu> {
    const state = this.snapshot(restaurantId);
    const removed = state.files.find((f) => f.id === fileId);
    if (removed?.url.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }
    const files = state.files.filter((f) => f.id !== fileId);
    // Les positions se comptent par genre, comme cote back : les PDF et les photos
    // ont chacun leur ordre. Renumeroter un seul genre laisserait des trous dans
    // l'autre, et l'ecran afficherait « 2 » pour le premier PDF restant.
    const next: Record<MenuFile['kind'], number> = { pdf: 0, image: 0 };
    const renumbered = files.map((f) => ({ ...f, position: next[f.kind]++ }));
    // Supprimer le dernier fichier du mode publie depublie : sinon le client
    // verrait une carte annoncee mais vide.
    const stillPublished =
      removed &&
      ((state.mode === 'pdf' && removed.kind === 'pdf') ||
        (state.mode === 'images' && removed.kind === 'image'))
        ? renumbered.some((f) => f.kind === removed.kind)
        : true;
    this.state = { ...state, files: renumbered, mode: stillPublished ? state.mode : 'none' };
    return of(structuredClone(this.state)).pipe(delay(200));
  }

  // Comme le back : l'ordre porte sur un seul genre, celui du premier identifiant.
  reorder(restaurantId: string, fileIds: string[]): Observable<Menu> {
    const state = this.snapshot(restaurantId);
    const kind = state.files.find((f) => f.id === fileIds[0])?.kind;
    const files = state.files.map((f) =>
      f.kind === kind ? { ...f, position: fileIds.indexOf(f.id) } : f,
    );
    files.sort((a, b) => a.position - b.position);
    this.state = { ...state, files };
    return of(structuredClone(this.state)).pipe(delay(200));
  }

  // Lecture publique : la meme memoire, mais reduite a ce qu'un client peut voir.
  getPublic(restaurantId: string): Observable<PublicMenu> {
    const state = this.snapshot(restaurantId);
    const kind = state.mode === 'pdf' ? 'pdf' : state.mode === 'images' ? 'image' : null;
    return of({
      restaurantName: 'Le Bistrot du Coin',
      mode: state.mode,
      manual: state.mode === 'manual' ? state.manual : null,
      files: kind ? state.files.filter((f) => f.kind === kind) : [],
    }).pipe(delay(300));
  }
}

// Apercu local : absent en environnement de test (jsdom n'a pas createObjectURL).
function objectUrl(file: File): string {
  try {
    return URL.createObjectURL(file);
  } catch {
    return `blob:mock/${file.name}`;
  }
}
