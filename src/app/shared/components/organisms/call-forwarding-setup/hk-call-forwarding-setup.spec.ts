import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HkCallForwardingSetup } from './hk-call-forwarding-setup';
import type { ForwardMode, ForwardingSetup } from '@core/models/telephony.model';

@Component({
  selector: 'hk-forwarding-host',
  imports: [HkCallForwardingSetup],
  template: ` <hk-call-forwarding-setup [setup]="setup()" (changed)="lastChange = $event" /> `,
})
class HostComponent {
  readonly setup = signal<ForwardingSetup | null>({
    did: '33974067183',
    mode: 'safety_net',
    ringSeconds: 10,
    verifiedAt: null,
  });
  lastChange: { mode: ForwardMode; ringSeconds: number } | null = null;
}

describe('HkCallForwardingSetup', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  function render(): { text: string; html: string; host: HostComponent } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    return { text: el.textContent ?? '', html: el.innerHTML, host: fixture.componentInstance };
  }

  it('affiche le DID normalisé, même reçu sans le +', () => {
    expect(render().text).toContain('+33 9 74 06 71 83');
  });

  // Deux codes en filet de sécurité : « sans réponse » ne couvre pas la ligne occupée.
  it('affiche les deux codes du filet de sécurité au format international', () => {
    const { text } = render();
    expect(text).toContain('**61*+33974067183**10#');
    expect(text).toContain('**67*+33974067183#');
  });

  // Le # ouvrirait un fragment d'URI et la fin du code serait perdue.
  it('encode le dièse dans le lien tel:', () => {
    expect(render().html).toContain('tel:**67*+33974067183%23');
  });

  it('signale le conflit avec la messagerie vocale', () => {
    expect(render().text).toContain('messagerie vocale');
  });

  it('affiche un état d’attente quand aucun numéro n’est attribué', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.setup.set(null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Numéro en cours d’attribution',
    );
  });
});
