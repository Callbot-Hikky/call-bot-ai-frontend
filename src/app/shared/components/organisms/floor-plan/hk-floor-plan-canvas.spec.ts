import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HkFloorPlanCanvas } from './hk-floor-plan-canvas';

// Konva a besoin d'un vrai <canvas> (indispo en jsdom) : le composant degrade sans
// casser (init Konva en try/catch). On teste donc UNIQUEMENT le host DOM (classes /
// style), independant du rendu Konva — c'est la contribution du mode service (fill).
@Component({
  selector: 'hk-canvas-host',
  imports: [HkFloorPlanCanvas],
  template: `<hk-floor-plan-canvas [fill]="fill" />`,
})
class HostComponent {
  fill = false;
}

function hostDiv(fixture: { nativeElement: HTMLElement }): HTMLElement {
  return fixture.nativeElement.querySelector('[role="img"]') as HTMLElement;
}

describe('HkFloorPlanCanvas (host / fill)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  it('fill=false : aspect-ratio 16/10, pas de h-full', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const host = hostDiv(fixture);
    expect(host.style.aspectRatio).toBe('16 / 10');
    expect(host.classList.contains('h-full')).toBe(false);
  });

  it('fill=true : h-full, sans aspect-ratio 16/10', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.fill = true;
    await fixture.whenStable();
    const host = hostDiv(fixture);
    expect(host.classList.contains('h-full')).toBe(true);
    expect(host.style.aspectRatio).not.toBe('16 / 10');
  });
});
