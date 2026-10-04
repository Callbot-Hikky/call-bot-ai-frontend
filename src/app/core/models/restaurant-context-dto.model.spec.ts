import { RestaurantContext } from './restaurant-context.model';
import { EMPTY_DTO, fromDto, isFullDto, toDto } from './restaurant-context-dto.model';

const EMPTY_CONTEXT: RestaurantContext = {
  dietary: [],
  equipments: [],
  payments: [],
  priceRange: '',
  cuisines: [],
  moods: [],
};

describe('toDto', () => {
  it('un régime coché devient true, les autres restent false', () => {
    const dto = toDto({ ...EMPTY_CONTEXT, dietary: ['halal'] });

    expect(dto.dietary).toEqual({
      halal: true,
      casher: false,
      vegetarian: false,
      gluten_free: false,
      vegan: false,
      bio: false,
    });
  });

  it('prix, cuisines et ambiances sont recopiés dans details', () => {
    const dto = toDto({
      ...EMPTY_CONTEXT,
      priceRange: '€€',
      cuisines: ['italienne', 'pizza'],
      moods: ['familiale'],
    });

    expect(dto.details).toEqual({
      price_range: '€€',
      cuisine_type: ['italienne', 'pizza'],
      ambiance: ['familiale'],
    });
  });
});

describe('fromDto', () => {
  it('le DTO vide donne un contexte entièrement vide', () => {
    expect(fromDto(EMPTY_DTO)).toEqual(EMPTY_CONTEXT);
  });

  it('aller-retour : fromDto(toDto(ctx)) restitue toutes les options cochées', () => {
    const ctx: RestaurantContext = {
      dietary: ['halal', 'casher', 'vegetarian', 'gluten_free', 'vegan', 'bio'],
      equipments: [
        'terrace',
        'air_conditioning',
        'private_parking',
        'wheelchair_accessible',
        'pets_allowed',
        'wifi',
        'high_chairs',
        'rooftop',
      ],
      payments: [
        'meal_vouchers',
        'takeaway',
        'card_payment',
        'delivery',
        'cash_only',
        'reservation_recommended',
      ],
      priceRange: '€€€€',
      cuisines: ['japonaise'],
      moods: ['romantique', 'calme'],
    };

    expect(fromDto(toDto(ctx))).toEqual(ctx);
  });
});

describe('isFullDto', () => {
  it('rejette null, un objet vide et un objet sans details', () => {
    expect(isFullDto(null)).toBe(false);
    expect(isFullDto({})).toBe(false);
    expect(isFullDto({ dietary: {}, equipments: {}, payments: {} })).toBe(false);
  });

  it('rejette un details sans listes cuisine_type / ambiance (sinon fromDto plante)', () => {
    const partial = {
      dietary: {},
      equipments: {},
      payments: {},
      details: { price_range: '€' },
    };

    expect(isFullDto(partial)).toBe(false);
  });

  it('accepte un DTO complet', () => {
    expect(isFullDto(EMPTY_DTO)).toBe(true);
  });
});
