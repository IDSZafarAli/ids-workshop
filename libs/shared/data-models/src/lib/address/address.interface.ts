import type {IdsBaseEntity} from '../common/index.js';

export type AddressType =
  | 'billing'
  | 'shipping'
  | 'correspondence'
  | 'physical'
  | 'mailing'
  | 'registered'
  | 'previous'
  | 'alternate';

export type AddressVerificationStatus =
  | 'unverified'
  | 'verified'
  | 'standardized'
  | 'corrected'
  | 'invalid'
  | 'manual'
  | 'partial';

export type GeocodingAccuracy =
  | 'rooftop'
  | 'range_interpolated'
  | 'geometric_center'
  | 'approximate'
  | 'unknown';

export interface GeocodingData {
  latitude: number;
  longitude: number;
  accuracy?: GeocodingAccuracy;
  placeId?: string;
  timeZone?: string;
}

export interface VerificationDetails {
  dpv?: string;
  rdi?: string;
  footnotes?: string[];
  suggestions?: string[];
}

export interface Address extends IdsBaseEntity {
  type: AddressType;
  label?: string;
  isPrimary: boolean;

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

  geocoding?: GeocodingData;

  verificationStatus?: AddressVerificationStatus;
  verificationDate?: Date;
  verificationProvider?: string;
  verificationDetails?: VerificationDetails;

  searchableText?: string;
  normalizedPostalCode?: string;
  geoHash?: string;
  plus4?: string;
  deliveryPoint?: string;

  notes?: string;
  isActive: boolean;
  validFrom?: Date;
  validTo?: Date;

  locationId: string;
}

export class UpdateAddressDto {
  type?: AddressType;
  label?: string;
  isPrimary?: boolean;

  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  countryName?: string;

  subLocality?: string;
  sortingCode?: string;
  administrativeArea?: string;

  formattedAddress?: string;
  geocoding?: GeocodingData;

  verificationStatus?: AddressVerificationStatus;
  verificationDate?: Date;
  verificationProvider?: string;
  verificationDetails?: VerificationDetails;

  searchableText?: string;
  normalizedPostalCode?: string;
  geoHash?: string;
  plus4?: string;
  deliveryPoint?: string;

  notes?: string;
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date;
}

export interface AddressEntitySearchCriteria {
  searchTerm?: string;
  locationId?: string;
  country?: string;
  region?: string;
  locality?: string;
  type?: AddressType;
  isActive?: boolean;
  verificationStatus?: AddressVerificationStatus;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AddressListResponse {
  data: Address[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CustomerAddressLink {
  id: string;
  customerId: string;
  addressId: string;
  isPrimary: boolean;
  displayOrder: number;
  validFrom?: Date;
  validTo?: Date;
  notes?: string;
  createdDate: Date;
  createdBy?: string;
  updatedDate: Date;
  updatedBy?: string;
  isDeleted: boolean;
}

export interface VendorAddressLink {
  id: string;
  vendorId: string;
  addressId: string;
  isPrimary: boolean;
  displayOrder: number;
  validFrom?: Date;
  validTo?: Date;
  notes?: string;
  createdDate: Date;
  createdBy?: string;
  updatedDate: Date;
  updatedBy?: string;
  isDeleted: boolean;
}

export interface LocationAddressLink {
  id: string;
  locationId: string;
  addressId: string;
  isPrimary: boolean;
  displayOrder: number;
  validFrom?: Date;
  validTo?: Date;
  notes?: string;
  createdDate: Date;
  createdBy?: string;
  updatedDate: Date;
  updatedBy?: string;
  isDeleted: boolean;
}
