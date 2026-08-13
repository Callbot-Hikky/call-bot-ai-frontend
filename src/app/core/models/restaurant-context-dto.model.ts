import { RestaurantContext } from './restaurant-context.model';

export interface RestaurantContextDto {
  dietary: {
    halal: boolean;
    casher: boolean;
    vegetarian: boolean;
    gluten_free: boolean;
    vegan: boolean;
    bio: boolean;
  };

  equipments: {
    terrace: boolean;
    air_conditioning: boolean;
    private_parking: boolean;
    wheelchair_accessible: boolean;
    pets_allowed: boolean;
    wifi: boolean;
    high_chairs: boolean;
    rooftop: boolean;
  };

  payments: {
    meal_vouchers: boolean;
    takeaway: boolean;
    card_payment: boolean;
    delivery: boolean;
    cash_only: boolean;
    reservation_recommended: boolean;
  };

  details: {
    price_range: '€' | '€€' | '€€€' | '€€€€' | '';
    cuisine_type: string[];
    ambiance: string[];
  };
}

export function toDto(ctx: RestaurantContext): RestaurantContextDto {
  return {
    dietary: {
      halal: ctx.dietary.includes('halal'),
      casher: ctx.dietary.includes('casher'),
      vegetarian: ctx.dietary.includes('vegetarian'),
      gluten_free: ctx.dietary.includes('gluten_free'),
      vegan: ctx.dietary.includes('vegan'),
      bio: ctx.dietary.includes('bio'),
    },

    equipments: {
      terrace: ctx.equipments.includes('terrace'),
      air_conditioning: ctx.equipments.includes('air_conditioning'),
      private_parking: ctx.equipments.includes('private_parking'),
      wheelchair_accessible: ctx.equipments.includes('wheelchair_accessible'),
      pets_allowed: ctx.equipments.includes('pets_allowed'),
      wifi: ctx.equipments.includes('wifi'),
      high_chairs: ctx.equipments.includes('high_chairs'),
      rooftop: ctx.equipments.includes('rooftop'),
    },

    payments: {
      meal_vouchers: ctx.payments.includes('meal_vouchers'),
      takeaway: ctx.payments.includes('takeaway'),
      card_payment: ctx.payments.includes('card_payment'),
      delivery: ctx.payments.includes('delivery'),
      cash_only: ctx.payments.includes('cash_only'),
      reservation_recommended: ctx.payments.includes('reservation_recommended'),
    },

    details: {
      price_range: ctx.priceRange as RestaurantContextDto['details']['price_range'],
      cuisine_type: [...ctx.cuisines],
      ambiance: [...ctx.moods],
    },
  };
}

export function fromDto(dto: RestaurantContextDto): RestaurantContext {
  const dietary: string[] = [];
  if (dto.dietary.halal) dietary.push('halal');
  if (dto.dietary.casher) dietary.push('casher');
  if (dto.dietary.vegetarian) dietary.push('vegetarian');
  if (dto.dietary.gluten_free) dietary.push('gluten_free');
  if (dto.dietary.vegan) dietary.push('vegan');
  if (dto.dietary.bio) dietary.push('bio');

  const equipments: string[] = [];
  if (dto.equipments.terrace) equipments.push('terrace');
  if (dto.equipments.air_conditioning) equipments.push('air_conditioning');
  if (dto.equipments.private_parking) equipments.push('private_parking');
  if (dto.equipments.wheelchair_accessible) equipments.push('wheelchair_accessible');
  if (dto.equipments.pets_allowed) equipments.push('pets_allowed');
  if (dto.equipments.wifi) equipments.push('wifi');
  if (dto.equipments.high_chairs) equipments.push('high_chairs');
  if (dto.equipments.rooftop) equipments.push('rooftop');

  const payments: string[] = [];
  if (dto.payments.meal_vouchers) payments.push('meal_vouchers');
  if (dto.payments.takeaway) payments.push('takeaway');
  if (dto.payments.card_payment) payments.push('card_payment');
  if (dto.payments.delivery) payments.push('delivery');
  if (dto.payments.cash_only) payments.push('cash_only');
  if (dto.payments.reservation_recommended) payments.push('reservation_recommended');

  return {
    dietary,
    equipments,
    payments,
    priceRange: dto.details.price_range,
    cuisines: [...dto.details.cuisine_type],
    moods: [...dto.details.ambiance],
  };
}
