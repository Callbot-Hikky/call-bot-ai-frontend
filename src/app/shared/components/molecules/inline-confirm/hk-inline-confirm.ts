import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkFocusOnInit } from '@shared/directives/hk-focus-on-init';

/**
 * Confirmation posee a l'endroit de l'action, jamais dans une fenetre modale.
 * Prend le focus a l'ouverture et se referme avec Echap : une action destructive
 * doit rester annulable au clavier.
 */
@Component({
  selector: 'hk-inline-confirm',
  imports: [HkButton, HkFocusOnInit],
  templateUrl: './hk-inline-confirm.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkInlineConfirm {
  readonly question = input.required<string>();
  readonly confirmLabel = input('Supprimer');
  readonly confirmTestId = input('confirm-remove-file');
  /** Vrai pendant un enregistrement : confirmer deux fois n'aurait pas de sens. */
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
