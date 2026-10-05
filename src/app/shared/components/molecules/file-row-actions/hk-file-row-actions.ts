import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

/** Un cran vers le haut ou vers le bas : aucune autre valeur n'a de sens. */
export type MoveDirection = -1 | 1;

/**
 * Les trois actions d'un fichier dans une liste : monter, descendre, supprimer.
 * Le composant n'agit pas : il annonce l'intention et laisse l'appelant decider.
 */
@Component({
  selector: 'hk-file-row-actions',
  imports: [HkButton, HkIcon],
  templateUrl: './hk-file-row-actions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFileRowActions {
  readonly fileId = input.required<string>();
  /** Nom du contenu pour les lecteurs d'ecran : « le PDF », « la photo ». */
  readonly label = input.required<string>();
  readonly first = input(false);
  readonly last = input(false);
  /** Vrai pendant un enregistrement : les actions sont alors inertes. */
  readonly busy = input(false);

  /** -1 pour monter, 1 pour descendre. */
  readonly moved = output<MoveDirection>();
  readonly removeAsked = output<void>();
}
