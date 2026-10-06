import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

/**
 * Bandeau d'attente : ce format est pret mais rien n'est encore visible par les
 * clients, et le bouton publie sur place. Les trois formats de la carte s'en
 * servent avec leur propre phrase ; c'est a l'appelant de decider quand il
 * s'affiche, la condition n'etant pas la meme pour des fichiers et pour une saisie.
 */
@Component({
  selector: 'hk-publish-banner',
  imports: [HkButton, HkIcon],
  templateUrl: './hk-publish-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkPublishBanner {
  readonly message = input.required<string>();
  readonly actionLabel = input.required<string>();
  /** Vrai pendant un enregistrement : publier deux fois n'aurait pas de sens. */
  readonly busy = input(false);

  readonly publishAsked = output<void>();
}
