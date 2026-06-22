import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HkBadge } from './hk-badge';

@Component({
  selector: 'hk-badge-host',
  imports: [HkBadge],
  template: `<hk-badge [status]="status" />`,
})
class HostComponent {
  status: 'confirmed' | 'no_show' = 'confirmed';
}

describe('HkBadge', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  it('affiche le libellé du statut confirmé', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Confirmée');
  });

  it('affiche un libellé pour no_show (jamais la couleur seule)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.status = 'no_show';
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Non présentée');
  });
});
