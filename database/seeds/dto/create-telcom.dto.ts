import type {SocialPlatform, TelcomType} from '@ids/data-models';

export interface CreateTelcomDto {
  type: TelcomType;
  subtype?: string;
  label?: string;
  address?: string;
  phoneCountryCode?: string;
  phoneNationalNumber?: string;
  phoneExtension?: string;
  phoneCountry?: string;
  emailVerified?: boolean;
  socialPlatform?: SocialPlatform;
  webType?: string;
  isPrimary?: boolean;
  displayOrder?: number;
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date;
  notes?: string;
  locationId?: string;
}
