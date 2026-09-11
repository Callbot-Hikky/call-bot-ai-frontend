import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCreditCard, lucideRefreshCw, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { GuaranteeService } from '@core/services/guarantee.service';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import { formatCents } from '@core/models/guarantee.model';
import type {
  ConnectAccount,
  GuaranteeMode,
  GuaranteeSettings,
  Payout,
} from '@core/models/guarantee.model';

/**
 * Réglages de garantie du restaurant, et suivi de l'argent encaissé.
 *
 * <p>Les modes payants restent verrouillés tant que Stripe n'a pas validé le compte :
 * les proposer plus tôt enverrait les convives sur une page de paiement en échec après
 * leur avoir annoncé une table retenue.
 */
@Component({
  selector: 'app-payment-settings-page',
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucideCreditCard, lucideRefreshCw, lucideTriangleAlert })],
  templateUrl: './payment-settings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSettingsPage implements OnInit {
  private readonly guarantee = inject(GuaranteeService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  protected readonly account = signal<ConnectAccount | null>(null);
  protected readonly settings = signal<GuaranteeSettings | null>(null);
  protected readonly payouts = signal<readonly Payout[]>([]);
  protected readonly saving = signal(false);
  protected readonly connecting = signal(false);

  protected readonly canCharge = computed(() => this.account()?.chargesEnabled === true);

  protected readonly modes: readonly { code: GuaranteeMode; label: string; hint: string }[] = [
    {
      code: 'none',
      label: 'Réservation libre',
      hint: 'Aucun engagement demandé au convive.',
    },
    {
      code: 'booking_fee',
      label: 'Frais de réservation',
      hint: "Un droit d'entrée réglé d'avance, non déduit de l'addition, remboursé si le convive annule dans les délais.",
    },
    {
      code: 'no_show',
      label: 'Garantie no-show',
      hint: 'Rien n’est débité à la réservation ; la carte est enregistrée et débitée si le convive ne vient pas.',
    },
  ];

  ngOnInit(): void {
    this.load();
  }

  private get restaurantId(): string {
    return this.session.restaurantId() ?? '';
  }

  private load(): void {
    const restaurantId = this.restaurantId;
    if (!restaurantId) {
      return;
    }
    this.guarantee.getConnectAccount(restaurantId).subscribe({
      next: (account) => this.account.set(account),
      error: () => this.account.set(null),
    });
    this.guarantee.getPayouts(restaurantId).subscribe({
      next: (payouts) => this.payouts.set(payouts),
      error: () => this.payouts.set([]),
    });
    this.guarantee.getSettings(restaurantId).subscribe({
      next: (settings) => this.settings.set(settings),
      error: () => this.settings.set(null),
    });
  }

  protected startOnboarding(): void {
    if (this.connecting()) {
      return;
    }
    this.connecting.set(true);
    this.guarantee.startOnboarding(this.restaurantId).subscribe({
      next: (onboarding) => {
        window.location.href = onboarding.url;
      },
      error: () => {
        this.connecting.set(false);
        this.toast.show("Impossible d'ouvrir l'inscription Stripe.", 'error');
      },
    });
  }

  protected refreshAccount(): void {
    this.guarantee.refreshConnectAccount(this.restaurantId).subscribe({
      next: (account) => this.account.set(account),
      error: () => this.toast.show("Impossible de relire l'état du compte.", 'error'),
    });
  }

  /**
   * Cliquer un mode payant que Stripe n'a pas encore débloqué lance l'inscription au
   * lieu de ne rien faire : c'est exactement le moment où le restaurateur veut la faire.
   */
  protected selectMode(mode: GuaranteeMode): void {
    if (mode !== 'none' && !this.canCharge()) {
      this.startOnboarding();

      return;
    }
    const current = this.settings();
    if (!current) {
      return;
    }
    this.settings.set({ ...current, mode });
  }

  protected setAmount(mode: GuaranteeMode, euros: string): void {
    const current = this.settings();
    if (!current) {
      return;
    }
    // Saisie en euros, stockée en centimes : aucun flottant ne survit à la conversion.
    const parsed = Number.parseFloat(euros.replace(',', '.'));
    const cents = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
    this.settings.set(
      mode === 'booking_fee'
        ? { ...current, bookingFeeCentsPerGuest: cents }
        : { ...current, noShowPenaltyCentsPerGuest: cents },
    );
  }

  protected setRefundWindow(hours: string): void {
    const current = this.settings();
    if (!current) {
      return;
    }
    const parsed = Number.parseInt(hours, 10);
    this.settings.set({
      ...current,
      refundWindowHours: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
    });
  }

  /**
   * L'échéance au-delà de laquelle le client ne peut plus rien changer lui-même.
   *
   * <p>Indépendante de la fenêtre de remboursement : rendre de l'argent et changer une
   * tablée n'engagent pas la salle de la même façon. Champ vidé = aucune limite, ce que
   * zéro exprime aussi.
   */
  protected setModificationWindow(hours: string): void {
    const current = this.settings();
    if (!current) {
      return;
    }
    if (hours.trim() === '') {
      this.settings.set({ ...current, modificationWindowHours: null });

      return;
    }
    const parsed = Number.parseInt(hours, 10);
    this.settings.set({
      ...current,
      modificationWindowHours: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
    });
  }

  protected eurosOf(cents: number | null): string {
    return cents === null ? '' : (cents / 100).toFixed(2);
  }

  protected save(): void {
    const current = this.settings();
    if (!current || this.saving() || !this.restaurantId) {
      return;
    }
    this.saving.set(true);
    this.guarantee.updateSettings(this.restaurantId, current).subscribe({
      next: (saved) => {
        this.settings.set(saved);
        this.saving.set(false);
        // Dit explicitement ce que l'enregistrement ne fait pas : les réservations déjà
        // prises gardent le mode sous lequel elles ont été acceptées.
        this.toast.show(
          'Réglages enregistrés. Les réservations déjà prises ne changent pas.',
          'success',
        );
      },
      error: () => {
        this.saving.set(false);
        this.toast.show("Réglages refusés : vérifiez le montant et l'état du compte.", 'error');
      },
    });
  }

  protected formatAmount(cents: number, currency: string): string {
    return formatCents(cents, currency);
  }

  protected formatDate(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected payoutLabel(status: Payout['status']): string {
    switch (status) {
      case 'paid':
        return 'Versé';
      case 'failed':
        return 'Échoué';
      default:
        return 'En cours';
    }
  }
}
