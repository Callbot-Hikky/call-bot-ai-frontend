import { formatDayLabel, localDateKey } from './format';

describe('format', () => {
  it('formatDayLabel ecrit la date en toutes lettres, en heure locale', () => {
    expect(formatDayLabel('2026-09-14')).toBe('lundi 14 septembre');
    // Le 1er du mois ne glisse pas sur la veille (pas de conversion UTC).
    expect(formatDayLabel('2026-10-01')).toBe('jeudi 1 octobre');
  });

  it('localDateKey rend la cle du jour local', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('openNativePicker', () => {
  it('appelle showPicker quand il existe, et ne casse rien sinon', async () => {
    const { openNativePicker } = await import('./format');
    const showPicker = vi.fn();
    openNativePicker({ showPicker } as unknown as HTMLInputElement);
    expect(showPicker).toHaveBeenCalledOnce();
    expect(() => openNativePicker({} as HTMLInputElement)).not.toThrow();
    const failing = {
      showPicker: () => {
        throw new Error('NotAllowedError');
      },
    } as unknown as HTMLInputElement;
    expect(() => openNativePicker(failing)).not.toThrow();
  });
});
