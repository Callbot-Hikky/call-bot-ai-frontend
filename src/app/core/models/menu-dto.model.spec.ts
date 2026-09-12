import { mapPublicMenu } from './menu-dto.model';

describe('mapPublicMenu', () => {
  it('garde le nom, le mode, les fichiers, et valide le document de saisie', () => {
    const menu = mapPublicMenu({
      restaurantName: 'Chez Hikky',
      mode: 'manual',
      manual: {
        version: 1,
        sections: [{ name: 'Plats', items: [{ name: 'Tajine', description: '', price: '18.00' }] }],
      },
      files: [],
    });
    expect(menu.restaurantName).toBe('Chez Hikky');
    expect(menu.manual?.sections[0].items[0].name).toBe('Tajine');
  });

  it('un document de saisie inattendu devient null, jamais une erreur', () => {
    const menu = mapPublicMenu({ restaurantName: 'X', mode: 'manual', manual: 'oops', files: [] });
    expect(menu.manual).toBeNull();
  });
});
