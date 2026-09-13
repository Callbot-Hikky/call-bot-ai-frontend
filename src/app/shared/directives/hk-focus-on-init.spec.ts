import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HkFocusOnInit } from './hk-focus-on-init';

@Component({
  imports: [HkFocusOnInit],
  template: `<button type="button">Avant</button>
    <div hkFocusOnInit><button type="button" data-testid="cible">Supprimer</button></div>`,
})
class HostComponent {}

describe('HkFocusOnInit', () => {
  it('donne le focus au premier bouton du bloc des son apparition', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('cible');
    fixture.nativeElement.remove();
  });
});
