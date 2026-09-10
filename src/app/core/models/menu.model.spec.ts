import {
  MANUAL_LIMITS,
  addItem,
  addSection,
  detectFileType,
  emptyManual,
  isManualMenu,
  menuErrorMessage,
  normalizePrice,
  removeItem,
  removeSection,
  updateItem,
  validateManual,
} from './menu.model';
import { HttpErrorResponse } from '@angular/common/http';

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe('menu.model', () => {
  describe('normalizePrice', () => {
    it('accepte les formats courants et normalise en deux decimales', () => {
      expect(normalizePrice('12')).toBe('12.00');
      expect(normalizePrice('12.5')).toBe('12.50');
      expect(normalizePrice('12,50')).toBe('12.50');
      expect(normalizePrice(' 7 ')).toBe('7.00');
    });

    it('refuse ce qui n est pas un prix', () => {
      expect(normalizePrice('abc')).toBeNull();
      expect(normalizePrice('-1')).toBeNull();
      expect(normalizePrice('12.345')).toBeNull();
      expect(normalizePrice('12345')).toBeNull();
      expect(normalizePrice('<script>')).toBeNull();
    });

    it('un prix vide reste vide (le prix est optionnel)', () => {
      expect(normalizePrice('')).toBe('');
      expect(normalizePrice('   ')).toBe('');
    });
  });

  describe('validateManual', () => {
    it('un menu vide est valide (rien a publier, mais rien de faux)', () => {
      expect(validateManual(emptyManual())).toEqual([]);
    });

    it('refuse une section sans nom et un plat sans nom', () => {
      let menu = addSection(emptyManual(), '');
      menu = addItem(menu, 0);
      const errors = validateManual(menu);
      expect(errors.some((e) => e.includes('section'))).toBe(true);
      expect(errors.some((e) => e.includes('plat'))).toBe(true);
    });

    it('refuse une description trop longue et des noms trop longs', () => {
      let menu = addSection(emptyManual(), 'a'.repeat(MANUAL_LIMITS.sectionName + 1));
      menu = addItem(menu, 0);
      menu = updateItem(menu, 0, 0, {
        name: 'b'.repeat(MANUAL_LIMITS.itemName + 1),
        description: 'c'.repeat(MANUAL_LIMITS.description + 1),
      });
      expect(validateManual(menu)).toHaveLength(3);
    });

    it('refuse plus de 20 sections et plus de 50 plats par section (document venu du back)', () => {
      // Les helpers sont bornes, mais un document stocke peut depasser : la validation le refuse.
      const tooManySections = {
        version: 1 as const,
        sections: Array.from({ length: MANUAL_LIMITS.sections + 1 }, (_, i) => ({
          name: `S${i}`,
          items: [],
        })),
      };
      expect(validateManual(tooManySections).some((e) => e.includes('sections'))).toBe(true);

      const dense = {
        version: 1 as const,
        sections: [
          {
            name: 'Plats',
            items: Array.from({ length: MANUAL_LIMITS.itemsPerSection + 1 }, (_, i) => ({
              name: `Plat ${i}`,
              description: '',
              price: '',
            })),
          },
        ],
      };
      expect(validateManual(dense).some((e) => e.includes('plats'))).toBe(true);
    });

    it('addSection est borne : la 21e section n est pas ajoutee', () => {
      let menu = emptyManual();
      for (let i = 0; i < MANUAL_LIMITS.sections + 5; i++) {
        menu = addSection(menu, `S${i}`);
      }
      expect(menu.sections).toHaveLength(MANUAL_LIMITS.sections);
    });
  });

  describe('helpers immuables', () => {
    it('ne modifie jamais le menu recu', () => {
      const original = addSection(emptyManual(), 'Entrees');
      const withItem = addItem(original, 0);
      expect(original.sections[0].items).toHaveLength(0);
      expect(withItem.sections[0].items).toHaveLength(1);

      const removed = removeItem(withItem, 0, 0);
      expect(withItem.sections[0].items).toHaveLength(1);
      expect(removed.sections[0].items).toHaveLength(0);

      expect(removeSection(original, 0).sections).toHaveLength(0);
      expect(original.sections).toHaveLength(1);
    });

    it('updateItem rogne les espaces et normalise le prix', () => {
      let menu = addSection(emptyManual(), 'Plats');
      menu = addItem(menu, 0);
      menu = updateItem(menu, 0, 0, { name: '  Tajine  ', price: '18,5' });
      expect(menu.sections[0].items[0]).toEqual({
        name: 'Tajine',
        description: '',
        price: '18.50',
      });
    });
  });

  describe('isManualMenu', () => {
    it('reconnait le document du back et rejette le reste', () => {
      expect(isManualMenu({ version: 1, sections: [] })).toBe(true);
      expect(
        isManualMenu({
          version: 1,
          sections: [{ name: 'A', items: [{ name: 'x', description: '', price: '' }] }],
        }),
      ).toBe(true);
      expect(isManualMenu({})).toBe(false);
      expect(isManualMenu({ version: 2, sections: [] })).toBe(false);
      expect(isManualMenu({ version: 1, sections: 'nope' })).toBe(false);
      expect(isManualMenu(null)).toBe(false);
    });
  });

  describe('detectFileType (memes signatures que le back)', () => {
    it('reconnait pdf, jpeg, png et webp sur les octets', () => {
      expect(detectFileType(new TextEncoder().encode('%PDF-1.7 contenu'))).toBe('pdf');
      expect(
        detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1)),
      ).toBe('jpeg');
      expect(
        detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)),
      ).toBe('png');
      const webp = new Uint8Array(16);
      webp.set(new TextEncoder().encode('RIFF'), 0);
      webp.set(new TextEncoder().encode('WEBP'), 8);
      expect(detectFileType(webp)).toBe('webp');
    });

    it('refuse svg, html, vide et inconnu', () => {
      expect(detectFileType(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBeNull();
      expect(detectFileType(new TextEncoder().encode('<!DOCTYPE html><html>'))).toBeNull();
      expect(detectFileType(new Uint8Array(0))).toBeNull();
      expect(detectFileType(bytes(0, 1, 2))).toBeNull();
    });
  });

  describe('menuErrorMessage', () => {
    it('traduit chaque code du back en francais', () => {
      const err = (status: number, code: string) =>
        new HttpErrorResponse({ status, error: { error: code } });
      expect(menuErrorMessage(err(415, 'unsupported_file_type'), 'x')).toContain('PDF');
      expect(menuErrorMessage(err(413, 'file_too_large'), 'x')).toContain('volumineux');
      expect(menuErrorMessage(err(409, 'too_many_files'), 'x')).toContain('8');
      expect(menuErrorMessage(err(409, 'mode_not_ready'), 'x')).toContain('contenu');
      expect(menuErrorMessage(err(403, 'forbidden'), 'x')).toContain('restaurant');
    });

    it('garde le message par defaut pour un code inconnu ou une erreur reseau', () => {
      expect(menuErrorMessage(new HttpErrorResponse({ status: 0 }), 'defaut')).toBe('defaut');
      expect(menuErrorMessage(new Error('boom'), 'defaut')).toBe('defaut');
    });
  });
});

describe('menu.model : page publique', () => {
  it('isSafePublicFileUrl n accepte que nos URL de fichiers publics', async () => {
    const { isSafePublicFileUrl } = await import('./menu.model');
    const ok =
      '/api/public/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu/files/06a7fb1d-3c23-4632-a7d0-a6754249c2a4';
    expect(isSafePublicFileUrl(ok)).toBe(true);
    expect(isSafePublicFileUrl('https://evil.example/x.pdf')).toBe(false);
    expect(isSafePublicFileUrl('javascript:alert(1)')).toBe(false);
    expect(
      isSafePublicFileUrl('/api/restaurants/40de0820-8f77-408a-aad4-847c889f7ffa/menu/files/x'),
    ).toBe(false);
    expect(
      isSafePublicFileUrl(
        '/api/public/restaurants/../menu/files/06a7fb1d-3c23-4632-a7d0-a6754249c2a4',
      ),
    ).toBe(false);
  });
});
