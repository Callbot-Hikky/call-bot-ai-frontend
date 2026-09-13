import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

// Une confirmation qui apparait doit recevoir le focus : au clavier ou au lecteur d'ecran,
// on tombe directement sur le bouton d'action, pas sur la corbeille qui vient d'etre cliquee.
@Directive({ selector: '[hkFocusOnInit]' })
export class HkFocusOnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      const target =
        this.host.nativeElement.querySelector<HTMLElement>('button, [tabindex]') ??
        this.host.nativeElement;
      target.focus();
    });
  }
}
