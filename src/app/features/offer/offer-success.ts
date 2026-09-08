import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheckBig } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { OfferService } from '@core/services/offer.service';
import { SessionService } from '@core/services/session.service';
import type { CheckoutSummary } from '@core/models/offer.model';

@Component({
  selector: 'app-offer-success',
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucideCircleCheckBig })],
  templateUrl: './offer-success.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferSuccess {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly offerService = inject(OfferService);
  private readonly session = inject(SessionService);

  protected readonly summary = signal<CheckoutSummary | null>(null);

  constructor() {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (sessionId) {
      // Best-effort : la confirmation reste affichée même si le récap n'est pas encore prêt.
      this.offerService.getCheckoutSummary(sessionId).subscribe({
        next: (summary) => this.summary.set(summary),
        error: () => this.summary.set(null),
      });
    }
  }

  /**
   * Etape suivante apres le paiement : onboarding du restaurant si l'utilisateur
   * n'en a pas encore, sinon son espace.
   */
  protected async continueToApp(): Promise<void> {
    // La souscription vient de changer : on resynchronise la session avant de router.
    await this.session.refresh();
    await this.router.navigateByUrl(this.session.needsOnboarding() ? '/onboarding' : '/dashboard');
  }

  protected formatPrice(summary: CheckoutSummary): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: summary.currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(summary.amountCents / 100);
  }
}
