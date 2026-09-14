import {
  activationCodes,
  cancellationCodes,
  formatDidForDisplay,
  toDialableDid,
} from './telephony.model';

describe('telephony.model', () => {
  describe('toDialableDid', () => {
    // Vérifié en réel : Bouygues refuse le format national dans un code MMI.
    it('ajoute le préfixe international au format national', () => {
      expect(toDialableDid('0974067183')).toBe('+33974067183');
    });

    // Le trunk restitue le DID tantôt avec le +, tantôt sans.
    it('ajoute le + quand il manque', () => {
      expect(toDialableDid('33974067183')).toBe('+33974067183');
    });

    it('supprime les espaces de saisie', () => {
      expect(toDialableDid('+33 9 74 06 71 83')).toBe('+33974067183');
    });
  });

  it('formatDidForDisplay : groupe les chiffres', () => {
    expect(formatDidForDisplay('33974067183')).toBe('+33 9 74 06 71 83');
  });

  describe('activationCodes', () => {
    it('front_line : un seul code, inconditionnel', () => {
      const codes = activationCodes('33974067183', 'front_line');
      expect(codes.length).toBe(1);
      expect(codes[0].code).toBe('**21*+33974067183#');
    });

    // « Sans réponse » ne couvre pas la ligne occupée, fréquent en plein service.
    it('safety_net : deux codes, sans réponse et occupé', () => {
      const codes = activationCodes('33974067183', 'safety_net', 10);
      expect(codes.map((c) => c.code)).toEqual(['**61*+33974067183**10#', '**67*+33974067183#']);
    });
  });

  it('cancellationCodes : miroir des codes d’activation', () => {
    expect(cancellationCodes('front_line').map((c) => c.code)).toEqual(['##21#']);
    expect(cancellationCodes('safety_net').map((c) => c.code)).toEqual(['##61#', '##67#']);
  });
});
