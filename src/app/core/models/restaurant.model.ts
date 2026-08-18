import { RestaurantContextDto } from './restaurant-context-dto.model';

export interface RestaurantDto {
  id: string;
  organizationId: string;
  name: string;
  phoneNumber: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string;
  locale: string;
  isActive: boolean;
  attributes: RestaurantContextDto;
  createdAt: string;
  updatedAt: string;
}
