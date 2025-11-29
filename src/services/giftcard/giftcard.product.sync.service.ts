/**
 * Gift Card Product Sync Service
 * 
 * Syncs products from Reloadly API to our database.
 * Handles:
 * - Full sync (all products)
 * - Incremental sync (new/updated products)
 * - Product image management (uses Reloadly's images)
 */

import { prisma } from '../../utils/prisma';
import { reloadlyProductsService } from '../reloadly/reloadly.products.service';
import { ReloadlyProduct } from '../../types/reloadly.types';

interface SyncResult {
  productsSynced: number;
  productsCreated: number;
  productsUpdated: number;
  productsFailed: number;
  errors: string[];
}

class GiftCardProductSyncService {
  /**
   * Sync all products from Reloadly
   */
  async syncAllProducts(syncType: 'full' | 'incremental' | 'manual' = 'full'): Promise<SyncResult> {
    const syncLog = await prisma.giftCardProductSyncLog.create({
      data: {
        syncType,
        status: 'processing',
        startedAt: new Date(),
      },
    });

    const result: SyncResult = {
      productsSynced: 0,
      productsCreated: 0,
      productsUpdated: 0,
      productsFailed: 0,
      errors: [],
    };

    try {
      let page = 1;
      const pageSize = 50;
      let hasMore = true;
      let totalPages = 1;

      console.log(`🔄 Starting ${syncType} sync of products from Reloadly...`);

      while (hasMore) {
        try {
          console.log(`📄 Fetching page ${page} of products...`);
          
          const response = await reloadlyProductsService.getProducts({
            page,
            size: pageSize,
            includeRange: true,
            includeFixed: true,
          });

          if (!response.content || response.content.length === 0) {
            console.log(`✅ No more products to sync. Completed at page ${page - 1}`);
            hasMore = false;
            break;
          }

          totalPages = response.totalPages || 1;
          console.log(`📦 Processing ${response.content.length} products (Page ${page}/${totalPages})...`);

          for (const product of response.content) {
            try {
              const wasCreated = await this.syncProduct(product);
              if (wasCreated) {
                result.productsCreated++;
                console.log(`✅ Created: ${product.productName} (ID: ${product.productId})`);
              } else {
                result.productsUpdated++;
                console.log(`🔄 Updated: ${product.productName} (ID: ${product.productId})`);
              }
              result.productsSynced++;
            } catch (error) {
              result.productsFailed++;
              const errorMsg = `Product ${product.productId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
              result.errors.push(errorMsg);
              console.error(`❌ Failed: ${errorMsg}`);
            }
          }

          // Check if there are more pages
          hasMore = page < totalPages;
          page++;
          
          // Small delay to avoid rate limiting
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          const errorMsg = `Page ${page}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          console.error(`❌ Page ${page} failed: ${errorMsg}`);
          hasMore = false;
        }
      }

      console.log(`✅ Sync completed: ${result.productsSynced} synced, ${result.productsCreated} created, ${result.productsUpdated} updated, ${result.productsFailed} failed`);

      // Update sync log
      await prisma.giftCardProductSyncLog.update({
        where: { id: syncLog.id },
        data: {
          productsSynced: result.productsSynced,
          productsCreated: result.productsCreated,
          productsUpdated: result.productsUpdated,
          productsFailed: result.productsFailed,
          status: result.productsFailed === 0 ? 'success' : result.productsSynced > 0 ? 'partial' : 'failed',
          errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
          completedAt: new Date(),
        },
      });

      return result;
    } catch (error) {
      await prisma.giftCardProductSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Sync a single product from Reloadly
   * @returns true if product was created, false if updated
   */
  private async syncProduct(reloadlyProduct: ReloadlyProduct): Promise<boolean> {
    const {
      productId,
      productName,
      brandName,
      countryCode,
      currencyCode,
      minValue,
      maxValue,
      fixedRecipientDenominations,
      logoUrl,
      logoUrls,
      isGlobal,
      productType,
      redeemInstruction,
      description,
    } = reloadlyProduct;

    // Determine if variable denomination
    const isVariableDenomination = !fixedRecipientDenominations || fixedRecipientDenominations.length === 0;

    // Get image URL (priority: logoUrl > logoUrls[0])
    const imageUrl = logoUrl || (logoUrls && logoUrls.length > 0 ? logoUrls[0] : null);

    // Check if product exists
    const existingProduct = await prisma.giftCardProduct.findUnique({
      where: { reloadlyProductId: productId },
    });

    const wasCreated = !existingProduct;

    // Upsert product
    const product = await prisma.giftCardProduct.upsert({
      where: { reloadlyProductId: productId },
      update: {
        productName,
        brandName: brandName || null,
        countryCode,
        currencyCode,
        minValue: minValue ? parseFloat(String(minValue)) : null,
        maxValue: maxValue ? parseFloat(String(maxValue)) : null,
        fixedValue: fixedRecipientDenominations && fixedRecipientDenominations.length === 1
          ? parseFloat(String(fixedRecipientDenominations[0]))
          : null,
        isVariableDenomination,
        isGlobal: isGlobal || false,
        reloadlyImageUrl: imageUrl || null,
        reloadlyLogoUrls: logoUrls ? JSON.parse(JSON.stringify(logoUrls)) : null,
        productType: productType || null,
        redemptionInstructions: redeemInstruction || null,
        description: description || null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        reloadlyProductId: productId,
        productName,
        brandName: brandName || null,
        countryCode,
        currencyCode,
        minValue: minValue ? parseFloat(String(minValue)) : null,
        maxValue: maxValue ? parseFloat(String(maxValue)) : null,
        fixedValue: fixedRecipientDenominations && fixedRecipientDenominations.length === 1
          ? parseFloat(String(fixedRecipientDenominations[0]))
          : null,
        isVariableDenomination,
        isGlobal: isGlobal || false,
        reloadlyImageUrl: imageUrl || null,
        reloadlyLogoUrls: logoUrls ? JSON.parse(JSON.stringify(logoUrls)) : null,
        productType: productType || null,
        redemptionInstructions: redeemInstruction || null,
        description: description || null,
        status: 'active',
        lastSyncedAt: new Date(),
      },
    });

    return wasCreated;

    // Sync product countries if global
    if (isGlobal) {
      // For global products, we might need to fetch countries separately
      // For now, we'll just store the main country code
    }
  }

  /**
   * Sync products for a specific country
   */
  async syncProductsByCountry(countryCode: string): Promise<SyncResult> {
    const result: SyncResult = {
      productsSynced: 0,
      productsCreated: 0,
      productsUpdated: 0,
      productsFailed: 0,
      errors: [],
    };

    try {
      const response = await reloadlyProductsService.getProductsByCountry(countryCode);

      if (response.content) {
        for (const product of response.content) {
          try {
            const wasCreated = await this.syncProduct(product);
            if (wasCreated) {
              result.productsCreated++;
            } else {
              result.productsUpdated++;
            }
            result.productsSynced++;
          } catch (error) {
            result.productsFailed++;
            result.errors.push(
              `Product ${product.productId}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
}

// Export singleton instance
export const giftCardProductSyncService = new GiftCardProductSyncService();

