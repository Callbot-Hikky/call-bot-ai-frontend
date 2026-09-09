import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheckBig, lucideCircleX } from '@ng-icons/lucide';
import { HlmCardImports } from '@spartan-ng/helm/card';

/**
 * Retour de Stripe après (ou au lieu de) la page de paiement.
 *
 * <p>Volontairement muette sur l'état réel de la réservation : la confirmation vient du
 * webhook, pas du navigateur, et le convive reçoit un message dès qu'elle est actée.
 * Affirmer ici que tout est confirmé serait affirmer ce que cette page ne sait pas.
 */
@Component({
  selector: 'app-payment-result-page',
  imports: [NgIcon, ...HlmCardImports],
  providers: [provideIcons({ lucideCircleCheckBig, lucideCircleX })],
  templateUrl: './payment-result-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentResultPage {
  // Renseigné par la route : 'paid' au retour d'un paiement, 'abandoned' sinon.
  readonly outcome = input.required<'paid' | 'abandoned'>();
}
