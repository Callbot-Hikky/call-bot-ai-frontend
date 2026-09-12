import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

// Titre d'onglet : « Page · Alloquence » quand la route en declare un, « Alloquence » sinon.
// Les pages client (carte, reservation) fixent leur titre elles-memes, avec le nom du restaurant.
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · Alloquence` : 'Alloquence');
  }
}
