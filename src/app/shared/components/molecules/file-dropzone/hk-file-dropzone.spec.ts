import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { HkFileDropzone } from './hk-file-dropzone';

function file(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('HkFileDropzone', () => {
  let fixture: ComponentFixture<HkFileDropzone>;
  let component: HkFileDropzone;
  let emitted: File[][];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HkFileDropzone],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HkFileDropzone);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('accept', ['image/png', 'application/pdf']);
    fixture.componentRef.setInput('maxBytes', 100);
    emitted = [];
    component.filesPicked.subscribe((files) => emitted.push(files));
    await fixture.whenStable();
  });

  it('emet un fichier accepte et efface toute erreur precedente', async () => {
    component['handleFiles']([file('carte.png', 'image/png')]);
    await fixture.whenStable();
    expect(emitted).toHaveLength(1);
    expect(emitted[0][0].name).toBe('carte.png');
    expect(fixture.nativeElement.querySelector('[data-testid="dropzone-error"]')).toBeNull();
  });

  it('refuse un type interdit avec un message en francais, sans emettre', async () => {
    component['handleFiles']([file('x.svg', 'image/svg+xml')]);
    await fixture.whenStable();
    expect(emitted).toHaveLength(0);
    const error = fixture.nativeElement.querySelector('[data-testid="dropzone-error"]');
    expect(error?.textContent).toContain('accepté');
  });

  it('refuse un fichier trop gros avec la limite dans le message', async () => {
    component['handleFiles']([file('gros.png', 'image/png', 101)]);
    await fixture.whenStable();
    expect(emitted).toHaveLength(0);
    expect(
      fixture.nativeElement.querySelector('[data-testid="dropzone-error"]')?.textContent,
    ).toContain('volumineux');
  });

  it('ne fait rien quand la zone est desactivee', async () => {
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    component['handleFiles']([file('carte.png', 'image/png')]);
    expect(emitted).toHaveLength(0);
  });

  it('ne garde que le premier fichier quand multiple est faux', async () => {
    component['handleFiles']([file('a.png', 'image/png'), file('b.png', 'image/png')]);
    expect(emitted[0]).toHaveLength(1);
  });

  it('accepte plusieurs fichiers quand multiple est vrai, et refuse le lot si un seul est mauvais', async () => {
    fixture.componentRef.setInput('multiple', true);
    await fixture.whenStable();
    component['handleFiles']([file('a.png', 'image/png'), file('b.png', 'image/png')]);
    expect(emitted[0]).toHaveLength(2);
    component['handleFiles']([file('c.png', 'image/png'), file('d.svg', 'image/svg+xml')]);
    expect(emitted).toHaveLength(1);
  });

  it('expose l attribut accept et un libelle au champ fichier', async () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
    expect(input.accept).toBe('image/png,application/pdf');
    expect(fixture.nativeElement.querySelector('label')?.textContent).toContain('Glissez');
  });
});
