import { TestBed } from '@angular/core/testing';
import { HkBarChart } from './hk-bar-chart';

describe('HkBarChart', () => {
  it('sans donnees, affiche le message vide plutot qu un cadre blanc', async () => {
    const fixture = TestBed.createComponent(HkBarChart);
    fixture.componentRef.setInput('bars', []);
    fixture.componentRef.setInput('emptyLabel', 'Aucun couvert attendu ce soir.');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Aucun couvert attendu ce soir.');
  });

  it('avec des donnees, une barre par creneau et pas de message vide', async () => {
    const fixture = TestBed.createComponent(HkBarChart);
    fixture.componentRef.setInput('bars', [
      { label: '19:00', value: 4 },
      { label: '20:00', value: 8 },
    ]);
    await fixture.whenStable();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('19:00');
    expect(text).toContain('8');
    expect(text).not.toContain('Aucune donnée');
  });
});
