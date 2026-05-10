import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  type PagedResponseDto,
  toMoney,
  toPagedDto,
  zeroMoney,
} from '@ids/data-models';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type {IDocumentQuery} from 'ravendb';

// ravendb ships QueryStatistics.d.ts.map but not the .d.ts itself — declare locally
type QueryStatistics = {totalResults: number};

import {createIdsBaseEntity, touchIdsBaseEntity} from '../common/entities/ids-base.entity';
import {RavenDocumentStoreProvider} from '../infrastructure/ravendb/document-store.provider';
import {RavenSessionFactory} from '../infrastructure/ravendb/session-factory';
import {Location} from '../location/entities/location.entity';
import type {PartCreateDto, PartCreateResponseDto} from './dto/part-create.dto';
import type {PartDetailResponseDto} from './dto/part-detail.dto';
import type {PartWithInventoryResponseDto} from './dto/part-list.query.dto';
import type {PartUpdateDto, PartUpdateResponseDto} from './dto/part-update.dto';
import {
  type BinSnapshot,
  type LocationBin,
  type LocationSnapshot,
  Part,
  PartLocation,
  PartStatus,
  PartVendor,
  type VendorSnapshot,
} from './entities/part.entity';
import {Parts_Search} from './indexes/parts-search.index';
import {
  toPartCreateResponseDto,
  toPartDetailResponseDto,
  toPartUpdateResponseDto,
  toPartWithInventoryResponseDtoList,
} from './part.mapper';

type Vendor = {id: string; vendorNumber: string; name: string};
type Bin = {id: string; binNumber: string; description: string};

@Injectable()
export class PartService implements OnModuleInit {
  private readonly _logger = new Logger(PartService.name);

  public constructor(
    private readonly _storeProvider: RavenDocumentStoreProvider,
    private readonly _sessionFactory: RavenSessionFactory,
  ) {}

  public async onModuleInit(): Promise<void> {
    try {
      await new Parts_Search().execute(this._storeProvider.getStore());
    } catch (error) {
      this._logger.warn(
        'Failed to create Parts/Search index — database may not exist yet',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  public async create(dto: PartCreateDto, userId: string): Promise<PartCreateResponseDto> {
    using session = this._sessionFactory.openSession();

    const docId: string = `parts/${dto.partNumber}`;
    const existing: Part | null = await session.load<Part>(docId);
    if (existing && !existing.isDeleted) {
      throw new ConflictException(`Part "${dto.partNumber}" already exists.`);
    }

    // ── Cross-field validations ───────────────────────────────────────────
    this.validateCrossFieldRules(dto);

    // ── Vendor validations ──────────────────────────────────────────────────
    const primaryVendors = dto.vendors.filter((v) => v.isPrimary);
    if (primaryVendors.length === 0) {
      throw new BadRequestException('A Primary Vendor is required.');
    }
    if (primaryVendors.length > 1) {
      throw new BadRequestException('Only one Primary Vendor is allowed.');
    }

    const vendorCodes = dto.vendors.map((v) => v.vendorNumber);
    if (new Set(vendorCodes).size !== vendorCodes.length) {
      throw new BadRequestException('Duplicate Vendor is not allowed.');
    }

    // ── Load and build vendor snapshots ─────────────────────────────────────
    const vendorIds = dto.vendors.map((v) => `vendors/${v.vendorNumber}`);
    const vendorDocs = await session.load<Vendor>(vendorIds);

    const vendors: PartVendor[] = [];
    for (const vendorDto of dto.vendors) {
      const vendor = vendorDocs[`vendors/${vendorDto.vendorNumber}`];
      if (!vendor) {
        throw new BadRequestException('The Vendor code is not valid.');
      }
      const snapshot: VendorSnapshot = {
        id: vendor.id,
        vendorNumber: vendor.vendorNumber,
        name: vendor.name,
      };
      const resolvedPartNumber: string = vendorDto.vendorPartNumber ?? dto.partNumber;
      const cost = toMoney(vendorDto.cost ?? 0, 'USD');
      vendors.push({
        vendor: snapshot,
        vendorPartNumber: resolvedPartNumber,
        isPrimary: vendorDto.isPrimary,
        cost,
      });
    }

    // ── Location + bin ──────────────────────────────────────────────────────
    const locations: PartLocation[] = [];
    if (dto.locationId) {
      const locationDocId: string = dto.locationId.startsWith('locations/')
        ? dto.locationId
        : `locations/${dto.locationId}`;

      const location: Location | null = await session.load<Location>(locationDocId);
      if (!location) {
        throw new NotFoundException(`Location "${dto.locationId}" not found`);
      }
      const locationSnapshot: LocationSnapshot = {
        id: location.id,
        name: location.name,
        displayName: location.displayName ?? undefined,
      };

      const rawLocationId: string = dto.locationId.startsWith('locations/')
        ? dto.locationId.slice('locations/'.length)
        : dto.locationId;

      const bins: LocationBin[] = [];
      if (dto.bins?.length) {
        const mainBins = dto.bins.filter((b) => b.isMain);
        if (mainBins.length !== 1) {
          throw new BadRequestException('Exactly one bin must be marked as primary.');
        }
        const binCodes = dto.bins.map((b) => b.binCode);
        if (new Set(binCodes).size !== binCodes.length) {
          throw new BadRequestException('Duplicate bin codes are not allowed.');
        }
        const binIds = dto.bins.map((b) => `bins/${rawLocationId}/${b.binCode}`);
        const binDocs = await session.load<Bin>(binIds);

        for (const binDto of dto.bins) {
          const bin = binDocs[`bins/${rawLocationId}/${binDto.binCode}`];
          if (!bin) {
            throw new BadRequestException(`Bin "${binDto.binCode}" not found.`);
          }
          const binSnapshot: BinSnapshot = {
            id: bin.id,
            binNumber: bin.binNumber,
            description: bin.description,
          };
          bins.push({
            bin: binSnapshot,
            numOnHand: binDto.isMain ? (dto.onHandQty ?? 0) : 0,
            isMain: binDto.isMain,
          });
        }
      }

      const onHand: number = dto.onHandQty ?? 0;
      locations.push({
        location: locationSnapshot,
        numOnHand: onHand,
        numCommitted: 0,
        numSpecialOrderCommitted: 0,
        numOnOrder: 0,
        numBackordered: 0,
        numAvailable: onHand,
        bins,
      });
    }

    // ── Derived fields ───────────────────────────────────────────────────────
    // Safe — validated exactly one primary vendor exists above
    const primaryVendor = vendors.find((v) => v.isPrimary) as PartVendor;
    const avgCost = primaryVendor.cost ?? zeroMoney('USD');
    const listPrice = toMoney(dto.listPrice ?? 0, 'USD');
    const onHand: number = dto.onHandQty ?? 0;

    const part: Part = {
      ...createIdsBaseEntity(userId),
      id: docId,
      partNumber: dto.partNumber,
      description: dto.description,
      status: (dto.status as PartStatus) ?? PartStatus.Active,
      vendorPartNumber: primaryVendor.vendorPartNumber,
      listPrice,
      avgCost,
      sellUom: dto.sellUom,
      purchaseUom: dto.purchaseUom,
      salePurchaseRatio: dto.salePurchaseRatio,
      comments: dto.comments,
      shippingWeight: dto.shippingWeight,
      shippingUnit: dto.shippingUnit,
      caseQty: dto.caseQty,
      minQty: dto.minQty,
      maxQty: dto.maxQty,
      minDays: dto.minDays,
      minOrder: dto.minOrder,
      promptForSerialNumber: dto.serialized,
      bypassPriceUpdate: dto.bypassPriceUpdate,
      priceGroup: dto.priceGroup,
      glGroup: dto.glGroup,
      taxCode: dto.taxCode,
      pogNumber: dto.pogNumber?.toUpperCase().trim(),
      popCode: dto.popCode?.trim(),
      alternatePartNumbers: dto.alternatePartNumbers,
      totalOnHand: onHand,
      totalCommitted: 0,
      totalSpecialOrderCommitted: 0,
      totalOnOrder: 0,
      totalBackordered: 0,
      totalAvailable: onHand,
      totalNetAvailable: onHand,
      vendors,
      locations,
    };

    await session.store(part, docId);
    await session.saveChanges();
    return toPartCreateResponseDto(part, dto.locationId ?? null);
  }

  public async findOne(partNumber: string): Promise<PartDetailResponseDto> {
    using session = this._sessionFactory.openSession();
    const part = await session.load<Part>(`parts/${partNumber}`);
    if (!part || part.isDeleted) {
      throw new NotFoundException(`Part with part number ${partNumber} not found`);
    }

    return toPartDetailResponseDto(part);
  }

  public async update(
    partNumber: string,
    dto: PartUpdateDto,
    userId: string,
  ): Promise<PartUpdateResponseDto> {
    using session = this._sessionFactory.openSession();

    const docId = `parts/${partNumber}`;
    const part: Part | null = await session.load<Part>(docId);
    if (!part || part.isDeleted) {
      throw new NotFoundException(`Part with part number ${partNumber} not found`);
    }

    // ── Cross-field validations ───────────────────────────────────────────
    this.validateCrossFieldRules(dto);

    // ── Partial update: three-way field semantics ─────────────────────────
    // undefined = key absent from JSON payload → don't touch this field
    // null      = explicitly sent as null      → clear this field (stored as null)
    // value     = new value                    → update this field
    //
    // `!== undefined` guards "was this in the payload?"
    // Null is preserved explicitly in the document so responses always return
    // null (not missing keys) for cleared optional fields — consistent API contract.
    //
    // Required fields (description, status) reject null via DTO validation.

    // Required fields — value only, null rejected by DTO
    if (dto.description !== undefined) {
      part.description = dto.description;
    }
    if (dto.status !== undefined) {
      part.status = dto.status as PartStatus;
    }

    // Optional fields — null explicitly clears (stored as null in document)
    if (dto.comments !== undefined) {
      part.comments = dto.comments ?? undefined;
    }
    if (dto.sellUom !== undefined) {
      part.sellUom = dto.sellUom ?? undefined;
    }
    if (dto.purchaseUom !== undefined) {
      part.purchaseUom = dto.purchaseUom ?? undefined;
    }
    if (dto.salePurchaseRatio !== undefined) {
      part.salePurchaseRatio = dto.salePurchaseRatio ?? undefined;
    }
    if (dto.shippingWeight !== undefined) {
      part.shippingWeight = dto.shippingWeight ?? undefined;
    }
    if (dto.shippingUnit !== undefined) {
      part.shippingUnit = dto.shippingUnit ?? undefined;
    }
    if (dto.listPrice !== undefined) {
      part.listPrice = dto.listPrice !== null ? toMoney(dto.listPrice, 'USD') : undefined;
    }
    if (dto.priceGroup !== undefined) {
      part.priceGroup = dto.priceGroup ?? undefined;
    }
    if (dto.glGroup !== undefined) {
      part.glGroup = dto.glGroup ?? undefined;
    }
    if (dto.taxCode !== undefined) {
      part.taxCode = dto.taxCode ?? undefined;
    }
    if (dto.pogNumber !== undefined) {
      part.pogNumber = dto.pogNumber ? dto.pogNumber.toUpperCase().trim() : undefined;
    }
    if (dto.popCode !== undefined) {
      part.popCode = dto.popCode ? dto.popCode.trim() : undefined;
    }
    if (dto.caseQty !== undefined) {
      part.caseQty = dto.caseQty ?? undefined;
    }
    if (dto.minQty !== undefined) {
      part.minQty = dto.minQty ?? undefined;
    }
    if (dto.maxQty !== undefined) {
      part.maxQty = dto.maxQty ?? undefined;
    }
    if (dto.minDays !== undefined) {
      part.minDays = dto.minDays ?? undefined;
    }
    if (dto.minOrder !== undefined) {
      part.minOrder = dto.minOrder ?? undefined;
    }
    if (dto.serialized !== undefined) {
      part.promptForSerialNumber = dto.serialized ?? undefined;
    }
    if (dto.bypassPriceUpdate !== undefined) {
      part.bypassPriceUpdate = dto.bypassPriceUpdate ?? undefined;
    }
    if (dto.alternatePartNumbers !== undefined) {
      part.alternatePartNumbers = dto.alternatePartNumbers;
    }

    // ── Vendor replacement (full replace semantics) ─────────────────────────
    if (dto.vendors !== undefined) {
      const primaryVendors = dto.vendors.filter((v) => v.isPrimary);
      if (primaryVendors.length === 0) {
        throw new BadRequestException('A Primary Vendor is required.');
      }
      if (primaryVendors.length > 1) {
        throw new BadRequestException('Only one Primary Vendor is allowed.');
      }

      const vendorCodes = dto.vendors.map((v) => v.vendorNumber);
      if (new Set(vendorCodes).size !== vendorCodes.length) {
        throw new BadRequestException('Duplicate Vendor is not allowed.');
      }

      const updateVendorIds = dto.vendors.map((v) => `vendors/${v.vendorNumber}`);
      const updateVendorDocs = await session.load<Vendor>(updateVendorIds);

      const newVendors: PartVendor[] = [];
      for (const vendorDto of dto.vendors) {
        const vendor = updateVendorDocs[`vendors/${vendorDto.vendorNumber}`];
        if (!vendor) {
          throw new BadRequestException('The Vendor code is not valid.');
        }
        const snapshot: VendorSnapshot = {
          id: vendor.id,
          vendorNumber: vendor.vendorNumber,
          name: vendor.name,
        };
        const resolvedPartNumber: string = vendorDto.vendorPartNumber ?? partNumber;
        const cost = toMoney(vendorDto.cost ?? 0, 'USD');
        newVendors.push({
          vendor: snapshot,
          vendorPartNumber: resolvedPartNumber,
          isPrimary: vendorDto.isPrimary,
          cost,
        });
      }
      part.vendors = newVendors;
      const primaryVendor = newVendors.find((v) => v.isPrimary);
      part.vendorPartNumber = primaryVendor?.vendorPartNumber;
      part.avgCost = primaryVendor?.cost ?? part.avgCost;
    }

    // ── Bin replacement (full replace on the matching location) ────────────────
    if (dto.bins !== undefined) {
      if (dto.bins.length > 0) {
        const mainBins = dto.bins.filter((b) => b.isMain);
        if (mainBins.length !== 1) {
          throw new BadRequestException('Exactly one bin must be marked as primary.');
        }
        const binCodes = dto.bins.map((b) => b.binCode);
        if (new Set(binCodes).size !== binCodes.length) {
          throw new BadRequestException('Duplicate bin codes are not allowed.');
        }
      }

      const normalizedLocationId = dto.locationId
        ? dto.locationId.startsWith('locations/')
          ? dto.locationId
          : `locations/${dto.locationId}`
        : null;

      const partLocation = normalizedLocationId
        ? part.locations?.find((pl) => pl.location.id === normalizedLocationId)
        : part.locations?.[0];
      if (partLocation) {
        const existingOnHand = new Map(
          (partLocation.bins ?? []).map((b) => [b.bin.binNumber, b.numOnHand]),
        );

        const rawLocationId = partLocation.location.id.startsWith('locations/')
          ? partLocation.location.id.slice('locations/'.length)
          : partLocation.location.id;
        const updateBinIds = dto.bins.map((b) => `bins/${rawLocationId}/${b.binCode}`);
        const updateBinDocs = await session.load<Bin>(updateBinIds);

        const newBins: LocationBin[] = [];
        for (const binDto of dto.bins) {
          const bin = updateBinDocs[`bins/${rawLocationId}/${binDto.binCode}`];
          if (!bin) {
            throw new BadRequestException(`Bin "${binDto.binCode}" not found.`);
          }
          newBins.push({
            bin: {id: bin.id, binNumber: bin.binNumber, description: bin.description},
            numOnHand: existingOnHand.get(binDto.binCode) ?? 0,
            isMain: binDto.isMain,
          });
        }
        partLocation.bins = newBins;
      }
    }

    touchIdsBaseEntity(part, userId);
    await session.saveChanges();
    return toPartUpdateResponseDto(part);
  }

  /**
   * Cross-field business rule validation shared by create and update.
   * Throws BadRequestException with field-level errors for the Problem Details filter.
   */
  private validateCrossFieldRules(dto: {
    minQty?: number;
    maxQty?: number;
    shippingWeight?: number;
    shippingUnit?: string;
    pogNumber?: string;
  }): void {
    const errors: string[] = [];

    if (dto.minQty !== undefined && dto.maxQty !== undefined && dto.maxQty < dto.minQty) {
      errors.push('maxQty Max Qty must be greater than or equal to Min Qty.');
    }

    if (dto.shippingWeight !== undefined && dto.shippingWeight > 0 && !dto.shippingUnit) {
      errors.push('shippingUnit Shipping unit is required when weight is entered.');
    }

    if (dto.pogNumber != null && dto.pogNumber.length > 0) {
      if (dto.pogNumber !== dto.pogNumber.toUpperCase()) {
        errors.push('pogNumber POG number must be uppercase.');
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
  }

  /**
   * Returns a paginated list of parts with inventory quantities for a given location.
   *
   * On-hand quantity — how it works
   * ─────────────────────────────────
   * The Part document stores two layers of on-hand data:
   *
   *   1. `Part.totalOnHand`          — rollup across ALL locations (sum of locations[i].numOnHand).
   *      Written on every create/update that touches inventory. Used for cross-location totals.
   *
   *   2. `PartLocation.numOnHand`    — on-hand at one specific location (sum of that location's
   *      bins[j].numOnHand). Stored inline in Part.locations[].
   *
   * The list response exposes both:
   *   - `totalOnHand`    → Part.totalOnHand       (all-location rollup, read directly from doc)
   *   - `locationOnHand` → PartLocation.numOnHand (scoped to the requested locationId)
   *
   * The mapper (toPartWithInventoryResponseDto) resolves `locationOnHand` by finding the
   * PartLocation entry whose location.id matches the requested locationId. If no matching
   * entry exists the field is null.
   *
   * There is no aggregation at query time — quantities are pre-computed and stored on the
   * document on every write, so the list query is a pure read with no arithmetic.
   */
  public async findAllWithInventory(query: {
    locationId: string;
    searchTerm?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PagedResponseDto<PartWithInventoryResponseDto>> {
    const {
      locationId: rawLocationId,
      searchTerm,
      page = DEFAULT_PAGE,
      pageSize = DEFAULT_PAGE_SIZE,
    } = query;

    const locationId: string = rawLocationId.startsWith('locations/')
      ? rawLocationId
      : `locations/${rawLocationId}`;

    const skip: number = (page - 1) * pageSize;

    using session = this._sessionFactory.openSession();
    let q: IDocumentQuery<Part> = session
      .query<Part>({indexName: 'Parts/Search'})
      .whereEquals('isDeleted', false);

    // Parts/Search index stores a flat `locationIds` array so we can filter
    // with a single equality check rather than querying nested location objects.
    q = q.whereEquals('locationIds', locationId);

    if (searchTerm?.trim() && searchTerm.trim().length >= 2) {
      q = q.search('query', `${searchTerm.trim()}*`, 'AND');
    }

    q = q.orderBy('partNumber');

    let stats!: QueryStatistics;
    const parts = await q
      .statistics((s) => {
        stats = s;
      })
      .skip(skip)
      .take(pageSize)
      .all();

    return toPagedDto(
      toPartWithInventoryResponseDtoList(parts, locationId),
      page,
      pageSize,
      stats.totalResults,
    );
  }
}
