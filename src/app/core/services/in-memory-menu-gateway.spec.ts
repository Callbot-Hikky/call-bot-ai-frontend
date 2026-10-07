import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { InMemoryMenuGateway } from './in-memory-menu-gateway';
import { Menu, withManualKeys } from '@core/models/menu.model';

const RID = 'r-1';

// Ce faux backend n'est branche qu'en mode maquette, mais il porte les memes
// regles que le vrai : s'il derive, le travail sans serveur ment sur le produit.
describe('InMemoryMenuGateway', () => {
  let gateway: InMemoryMenuGateway;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), InMemoryMenuGateway],
    });
    gateway = TestBed.inject(InMemoryMenuGateway);
  });

  function file(name: string, type: 'pdf' | 'jpeg' = 'pdf'): File {
    return new File([new Uint8Array(8)], name, {
      type: type === 'pdf' ? 'application/pdf' : 'image/jpeg',
    });
  }

  it('part d une carte vide et la garde entre deux lectures', async () => {
    const first = await firstValueFrom(gateway.fetch(RID));
    expect(first.mode).toBe('none');
    expect(first.files).toEqual([]);

    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    const second = await firstValueFrom(gateway.fetch(RID));
    expect(second.files).toHaveLength(1);
  });

  it('repart de zero quand on change de restaurant', async () => {
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    const other = await firstValueFrom(gateway.fetch('r-2'));
    expect(other.files).toEqual([]);
  });

  it('refuse de publier un mode dont le contenu manque, comme le back', async () => {
    await expect(firstValueFrom(gateway.put(RID, { mode: 'pdf' }))).rejects.toMatchObject({
      status: 409,
    });
    await expect(firstValueFrom(gateway.put(RID, { mode: 'images' }))).rejects.toMatchObject({
      status: 409,
    });
    await expect(firstValueFrom(gateway.put(RID, { mode: 'manual' }))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('publie un mode des que son contenu existe', async () => {
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    const menu = await firstValueFrom(gateway.put(RID, { mode: 'pdf' }));
    expect(menu.mode).toBe('pdf');
  });

  it('numerote les positions par genre, et les PDF ne gardent pas de trou', async () => {
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    await firstValueFrom(gateway.upload(RID, file('b.pdf'), 'pdf'));
    let menu = await firstValueFrom(gateway.upload(RID, file('c.jpg', 'jpeg'), 'jpeg'));
    const pdfs = menu.files.filter((f) => f.kind === 'pdf');
    expect(pdfs.map((f) => f.position)).toEqual([0, 1]);

    menu = await firstValueFrom(gateway.removeFile(RID, pdfs[0].id));
    expect(menu.files.filter((f) => f.kind === 'pdf').map((f) => f.position)).toEqual([0]);
    expect(menu.files.filter((f) => f.kind === 'image').map((f) => f.position)).toEqual([0]);
  });

  it('depublie quand le dernier fichier du mode publie disparait', async () => {
    const uploaded = await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    await firstValueFrom(gateway.put(RID, { mode: 'pdf' }));
    const menu = await firstValueFrom(gateway.removeFile(RID, uploaded.files[0].id));
    expect(menu.mode).toBe('none');
  });

  it('laisse le mode publie tant qu il reste un fichier du bon genre', async () => {
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    const two = await firstValueFrom(gateway.upload(RID, file('b.pdf'), 'pdf'));
    await firstValueFrom(gateway.put(RID, { mode: 'pdf' }));
    const menu = await firstValueFrom(gateway.removeFile(RID, two.files[0].id));
    expect(menu.mode).toBe('pdf');
  });

  it('retirer une photo ne depublie pas une carte en PDF', async () => {
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    const withImage = await firstValueFrom(gateway.upload(RID, file('c.jpg', 'jpeg'), 'jpeg'));
    await firstValueFrom(gateway.put(RID, { mode: 'pdf' }));
    const image = withImage.files.find((f) => f.kind === 'image')!;
    const menu = await firstValueFrom(gateway.removeFile(RID, image.id));
    expect(menu.mode).toBe('pdf');
  });

  it('reordonne un seul genre et laisse l autre intact', async () => {
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    await firstValueFrom(gateway.upload(RID, file('b.pdf'), 'pdf'));
    const before = await firstValueFrom(gateway.upload(RID, file('c.jpg', 'jpeg'), 'jpeg'));
    const pdfs = before.files.filter((f) => f.kind === 'pdf');

    const menu = await firstValueFrom(gateway.reorder(RID, [pdfs[1].id, pdfs[0].id]));
    const order = menu.files.filter((f) => f.kind === 'pdf').map((f) => f.id);
    expect(order).toEqual([pdfs[1].id, pdfs[0].id]);
    expect(menu.files.filter((f) => f.kind === 'image')).toHaveLength(1);
  });

  it('la lecture publique ne montre que le genre publie', async () => {
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    await firstValueFrom(gateway.upload(RID, file('c.jpg', 'jpeg'), 'jpeg'));

    let pub = await firstValueFrom(gateway.getPublic(RID));
    expect(pub.mode).toBe('none');
    expect(pub.files).toEqual([]);
    expect(pub.manual).toBeNull();

    await firstValueFrom(gateway.put(RID, { mode: 'pdf' }));
    pub = await firstValueFrom(gateway.getPublic(RID));
    expect(pub.files.every((f) => f.kind === 'pdf')).toBe(true);
    expect(pub.manual).toBeNull();
  });

  it('la saisie publiee est renvoyee, et conservee quand seul le mode change', async () => {
    const manual = withManualKeys({
      version: 1,
      sections: [{ name: 'Entrees', items: [{ name: 'Soupe', price: '8.00', description: '' }] }],
    });
    await firstValueFrom(gateway.put(RID, { mode: 'manual', manual }));
    const pub = await firstValueFrom(gateway.getPublic(RID));
    expect(pub.mode).toBe('manual');
    expect(pub.manual?.sections[0].name).toBe('Entrees');

    // Le mode seul : la saisie reste en memoire, comme cote back.
    await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    const menu: Menu = await firstValueFrom(gateway.put(RID, { mode: 'pdf' }));
    expect(menu.manual.sections[0].name).toBe('Entrees');
  });

  it('ne laisse pas l appelant modifier sa memoire interne', async () => {
    const menu = await firstValueFrom(gateway.upload(RID, file('a.pdf'), 'pdf'));
    menu.files.length = 0;
    menu.mode = 'images';
    const again = await firstValueFrom(gateway.fetch(RID));
    expect(again.files).toHaveLength(1);
    expect(again.mode).toBe('none');
  });
});
