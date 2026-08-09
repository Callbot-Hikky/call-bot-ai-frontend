export const DIETARY_OPTIONS = [
  {
    id: 'halal',
    label: 'Halal',
  },
  {
    id: 'casher',
    label: 'Casher',
  },
  {
    id: 'vegetarien',
    label: 'Végétarien',
  },
  {
    id: 'options-without-gluten',
    label: 'Options sans gluten',
  },
  {
    id: 'vegan',
    label: 'Vegan',
  },
  {
    id: 'bio',
    label: '100% Bio',
  },
] as const;

export const EQUIPMENTS = [
  {
    id: 'terrasse',
    label: 'Terrasse',
  },
  {
    id: 'climatisation',
    label: 'Climatisation',
  },
  {
    id: 'parking-prive',
    label: 'Parking privé',
  },
  {
    id: 'accessiblepmr-fauteuil',
    label: 'Accessible PMR (Fauteuil)',
  },
  {
    id: 'animaux-acceptes',
    label: 'Animaux acceptés',
  },
  {
    id: 'wi-fi-clients',
    label: 'Wi-Fi clients',
  },
  {
    id: 'chaises-hautes-enfants',
    label: 'Chaises hautes enfants',
  },
  {
    id: 'rooftop',
    label: 'Rooftop',
  },
] as const;

export const PAYMENTS_AND_OFFERS = [
  {
    id: 'titres-restaurants',
    label: 'Titres-restaurants',
  },
  {
    id: 'vente-a-emporter',
    label: 'Vente à emporter',
  },
  {
    id: 'carte-bancaire',
    label: 'Carte bancaire',
  },
  {
    id: 'livraison',
    label: 'Livraison',
  },
  {
    id: 'especes-uniquement',
    label: 'Espèces uniquement',
  },
  {
    id: 'reservation-conseillee',
    label: 'Réservation conseillée',
  },
] as const;

export const KITCHEN_TYPES = [
  {
    groupName: 'Cuisines françaises & régionales',
    suggestions: [
      {
        name: 'Française traditionnelle',
        country: 'FR',
      },
      {
        name: 'Bistrot',
        country: 'FR',
      },
      {
        name: 'Brasserie',
        country: 'FR',
      },
      {
        name: 'Gastronomique',
        country: 'FR',
      },
    ],
  },
  {
    groupName: 'Européennes',
    suggestions: [
      {
        name: 'Italienne',
        country: 'IT',
      },
      {
        name: 'Pizzeria',
        country: 'IT',
      },
      {
        name: 'Espagnole / Tapas',
        country: 'ES',
      },
      {
        name: 'Portugaise',
        country: 'PT',
      },
      {
        name: 'Grecque',
        country: 'GR',
      },
      {
        name: 'Serbe / Balkanique',
        country: 'RS',
      },
    ],
  },
  {
    groupName: 'Méditerranée & Moyen-Orient',
    suggestions: [
      {
        name: 'Libanaise',
        country: 'LB',
      },
      {
        name: 'Turque',
        country: 'TR',
      },
      {
        name: 'Marocaine',
        country: 'MA',
      },
      {
        name: 'Israélienne',
        country: 'IL',
      },
    ],
  },
  {
    groupName: 'Asiatiques',
    suggestions: [
      {
        name: 'Japonaise',
        country: 'JP',
      },
      {
        name: 'Sushi',
        country: 'JP',
      },
      {
        name: 'Chinoise',
        country: 'CN',
      },
      {
        name: 'Thaïlandaise',
        country: 'TH',
      },
      {
        name: 'Vietnamienne',
        country: 'VN',
      },
      {
        name: 'Coréenne',
        country: 'KR',
      },
      {
        name: 'Indienne',
        country: 'IN',
      },
    ],
  },
  {
    groupName: 'Afrique',
    suggestions: [
      {
        name: 'Ivoirienne',
        country: 'CI',
      },
      {
        name: 'Sénégalaise',
        country: 'SN',
      },
      {
        name: 'Éthiopienne',
        country: 'ET',
      },
      {
        name: 'Nord-africaine',
        country: 'DZ',
      },
    ],
  },
  {
    groupName: 'Amériques',
    suggestions: [
      {
        name: 'Américaine / Burger',
        country: 'US',
      },
      {
        name: 'Mexicaine',
        country: 'MX',
      },
      {
        name: 'Péruvienne',
        country: 'PE',
      },
      {
        name: 'Brésilienne',
        country: 'BR',
      },
    ],
  },
  {
    groupName: 'Autres',
    suggestions: [
      {
        name: 'Fusion',
        country: '',
      },
      {
        name: 'Végétarienne',
        country: '',
      },
      {
        name: 'Fruits de mer',
        country: '',
      },
      {
        name: 'Street food',
        country: '',
      },
    ],
  },
] as const;

export const MOODS = [
  {
    groupName: '',
    suggestions: [
      'Chaleureuse',
      'Familiale',
      'Romantique',
      'Branchée',
      'Décontractée',
      'Chic',
      'Bistrot / Conviviale',
      'Rustique',
      'Moderne',
      'Cosy',
      'Festive',
      'Traditionnelle',
      'Bord de mer',
      'Terrasse',
      'Feutrée',
    ],
  },
] as const;
