import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HkCallbackRequests } from './hk-callback-requests';
import { CallbackRequest } from '@core/models/callback-request.model';

@Component({
  selector: 'hk-callback-host',
  imports: [HkCallbackRequests],
  template: `
    <hk-callback-requests
      [requests]="requests"
      [loading]="loading"
      [error]="error"
      (handled)="handledId = $event.id"
      (retry)="retried = true"
    />
  `,
})
class HostComponent {
  requests: CallbackRequest[] = [
    {
      id: 'cb-1',
      customerName: 'Karim Haddad',
      phone: '+33 6 98 76 54 32',
      requestedAt: '2026-06-22T17:42:00+02:00',
      reason: 'Table pour 12',
      status: 'pending',
    },
  ];
  loading = false;
  error = false;
  handledId = '';
  retried = false;
}

describe('HkCallbackRequests', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  it('affiche les demandes de rappel', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Demandes de rappel');
    expect(text).toContain('Karim Haddad');
  });

  it('émet handled au clic sur le bouton traité', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const checkButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('hk-icon-button button');
    checkButton.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.handledId).toBe('cb-1');
  });

  it('affiche le bouton Réessayer en cas d erreur', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.error = true;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Réessayer');
  });
});
