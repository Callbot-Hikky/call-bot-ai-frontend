import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheckBig, lucideCircleX, lucideHourglass } from '@ng-icons/lucide';
import { HlmCardImports } from '@spartan-ng/helm/card';

/**
 * Retour de Stripe après (ou au lieu de) la page de paiement.
 *
 * <p>Volontairement muette sur l'état réel de la réservation : la confirmation vient du
 * webhook, pas du navigateur, et le convive reçoit un message dès qu'elle est actée.
 * Affirmer ici que tout est confirmé serait affirmer ce que cette page ne sait pas.
 *
 * <p>Le retour d'un complément a sa propre page, et pas seulement son propre texte :
 * régler un complément n'achète pas une table, il achète le droit d'être déplacé sur une
 * plus grande **s'il en reste une**. La page « c'est enregistré » promettrait une
 * confirmation là où le paiement peut encore repartir en remboursement.
 */
@Component({
  selector: 'app-payment-result-page',
  imports: [NgIcon, ...HlmCardImports],
  providers: [provideIcons({ lucideCircleCheckBig, lucideCircleX, lucideHourglass })],
  templateUrl: './payment-result-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentResultPage {
  // Renseigné par la route : 'paid' au retour d'un paiement, 'top-up-paid' au retour
  // d'un complément, 'abandoned' quand le convive a quitté la page de paiement.
  readonly outcome = input.required<'paid' | 'top-up-paid' | 'abandoned'>();
}
