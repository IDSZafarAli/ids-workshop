import type {AddressType} from '@ids/data-models';

export interface CreateAddressDto {
  type: AddressType;
  label?: string;
  isPrimary?: boolean;

  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  locality: string;
  region?: string;
  postalCode?: string;
  country: string;
  countryName?: string;

  subLocality?: string;
  sortingCode?: string;
  administrativeArea?: string;

  formattedAddress?: string;

  notes?: string;
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date;

  locationId: string;
}
