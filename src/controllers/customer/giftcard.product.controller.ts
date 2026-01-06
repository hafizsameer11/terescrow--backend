/**
 * Gift Card Product Controller
 * 
 * Handles product catalog endpoints for customers:
 * - Get all products
 * - Get product by ID
 * - Get product countries
 * - Get product card types
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../../utils/prisma';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { reloadlyProductsService } from '../../services/reloadly/reloadly.products.service';
import { reloadlyCountriesService } from '../../services/reloadly/reloadly.countries.service';

/**
 * Get all gift card products
 */
export const getProductsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { countryCode, category, search, page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Reloadly has a max limit of 200 per request
    const MAX_PAGE_SIZE = 200;
    const requestedLimit = Math.min(limitNum, MAX_PAGE_SIZE);
    
    // Build Reloadly query parameters
    const queryParams: any = {
      page: pageNum,
      size: requestedLimit,
    };

    if (countryCode) {
      queryParams.countryCode = countryCode as string;
    }

    if (search) {
      queryParams.productName = search as string;
    }

    // If limit > 200, we need to make multiple requests
    let allProducts: any[] = [];
    let currentPage = pageNum;
    let remainingLimit = limitNum;
    let totalElements = 0;
    let totalPages = 0;

    while (remainingLimit > 0) {
      const currentSize = Math.min(remainingLimit, MAX_PAGE_SIZE);
      queryParams.page = currentPage;
      queryParams.size = currentSize;

      const reloadlyResponse = await reloadlyProductsService.getProducts(queryParams);
      
      // Store pagination info from first request
      if (allProducts.length === 0) {
        totalElements = reloadlyResponse.totalElements || 0;
        totalPages = reloadlyResponse.totalPages || 0;
      }

      allProducts = allProducts.concat(reloadlyResponse.content);
      remainingLimit -= reloadlyResponse.content.length;

      // If we got fewer items than requested, we've reached the end
      if (reloadlyResponse.content.length < currentSize) {
        break;
      }

      // If we need more, go to next page
      if (remainingLimit > 0) {
        currentPage++;
      }
    }

    // Filter by category if provided
    if (category) {
      allProducts = allProducts.filter(
        (product) => product.productType?.toLowerCase() === (category as string).toLowerCase()
      );
    }

    // Format response to include all Reloadly API fields
    const formattedProducts = allProducts.map((product: any) => ({
      productId: product.productId,
      id: product.productId.toString(), // Use Reloadly productId as id
      productName: product.productName,
      global: product.global ?? product.isGlobal ?? false,
      status: product.status || 'ACTIVE',
      supportsPreOrder: product.supportsPreOrder ?? false,
      senderFee: product.senderFee ?? null,
      senderFeePercentage: product.senderFeePercentage ?? null,
      discountPercentage: product.discountPercentage ?? null,
      denominationType: product.denominationType || (product.fixedRecipientDenominations?.length > 0 ? 'FIXED' : 'RANGE'),
      recipientCurrencyCode: product.recipientCurrencyCode || product.currencyCode,
      minRecipientDenomination: product.minRecipientDenomination ?? product.minValue ?? null,
      maxRecipientDenomination: product.maxRecipientDenomination ?? product.maxValue ?? null,
      senderCurrencyCode: product.senderCurrencyCode ?? null,
      minSenderDenomination: product.minSenderDenomination ?? null,
      maxSenderDenomination: product.maxSenderDenomination ?? null,
      fixedRecipientDenominations: product.fixedRecipientDenominations || [],
      fixedSenderDenominations: product.fixedSenderDenominations || null,
      fixedRecipientToSenderDenominationsMap: product.fixedRecipientToSenderDenominationsMap || null,
      metadata: product.metadata || null,
      logoUrls: product.logoUrls || (product.logoUrl ? [product.logoUrl] : []),
      brand: product.brand ? {
        brandId: product.brand.brandId,
        brandName: product.brand.brandName,
        logoUrl: product.brand.logoUrl,
      } : (product.brandName ? {
        brandId: null,
        brandName: product.brandName,
        logoUrl: null,
      } : null),
      category: product.category ? {
        id: product.category.id,
        name: product.category.name,
      } : (product.productType ? {
        id: null,
        name: product.productType,
      } : null),
      country: product.country ? {
        isoName: product.country.isoName,
        name: product.country.name,
        flagUrl: product.country.flagUrl,
      } : (product.countryCode ? {
        isoName: product.countryCode,
        name: null,
        flagUrl: null,
      } : null),
      redeemInstruction: product.redeemInstruction || null,
      additionalRequirements: product.additionalRequirements || null,
      recipientCurrencyToSenderCurrencyExchangeRate: product.recipientCurrencyToSenderCurrencyExchangeRate ?? null,
      // Legacy fields for backward compatibility
      brandName: product.brandName || product.brand?.brandName || null,
      countryCode: product.countryCode || product.country?.isoName || null,
      currencyCode: product.currencyCode || product.recipientCurrencyCode,
      minValue: product.minRecipientDenomination ?? product.minValue ?? null,
      maxValue: product.maxRecipientDenomination ?? product.maxValue ?? null,
      fixedValue: product.fixedRecipientDenominations?.[0] || product.fixedSenderDenominations?.[0] || null,
      isVariableDenomination: !product.fixedRecipientDenominations?.length && !product.fixedSenderDenominations?.length,
      imageUrl: product.logoUrls?.[0] || product.logoUrl || null,
      description: product.description || null,
    }));

    return new ApiResponse(200, {
      products: formattedProducts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: category ? formattedProducts.length : totalElements,
        totalPages: category ? Math.ceil(formattedProducts.length / limitNum) : totalPages,
        returned: formattedProducts.length,
      },
    }, 'Products retrieved successfully').send(res);
  } catch (error: any) {
    // Log detailed error information
    console.error('Error in getProductsController:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      response: error?.response?.data || error?.response,
      status: error?.response?.status || error?.status,
      statusText: error?.response?.statusText,
      error: error?.error,
      query: req.query,
      fullError: error,
    });

    if (error instanceof ApiError) {
      return next(error);
    }
    
    const errorMessage = error?.message || 'Failed to fetch products from Reloadly';
    console.error('Reloadly API error details:', {
      errorMessage,
      errorDetails: error?.response?.data || error?.error || error?.response,
      status: error?.response?.status || error?.status,
    });
    
    next(ApiError.internal(`Failed to fetch products from Reloadly: ${errorMessage}`));
  }
};

/**
 * Get product by ID
 */
export const getProductByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId } = req.params;

    // Always fetch from Reloadly to get complete and up-to-date product data
    try {
      const reloadlyProduct: any = await reloadlyProductsService.getProductById(
        parseInt(productId, 10)
      );

      // Format response to include all Reloadly API fields
      const formattedProduct = {
        productId: reloadlyProduct.productId,
        id: reloadlyProduct.productId.toString(),
        productName: reloadlyProduct.productName,
        global: reloadlyProduct.global ?? reloadlyProduct.isGlobal ?? false,
        status: reloadlyProduct.status || 'ACTIVE',
        supportsPreOrder: reloadlyProduct.supportsPreOrder ?? false,
        senderFee: reloadlyProduct.senderFee ?? null,
        senderFeePercentage: reloadlyProduct.senderFeePercentage ?? null,
        discountPercentage: reloadlyProduct.discountPercentage ?? null,
        denominationType: reloadlyProduct.denominationType || (reloadlyProduct.fixedRecipientDenominations?.length > 0 ? 'FIXED' : 'RANGE'),
        recipientCurrencyCode: reloadlyProduct.recipientCurrencyCode || reloadlyProduct.currencyCode,
        minRecipientDenomination: reloadlyProduct.minRecipientDenomination ?? reloadlyProduct.minValue ?? null,
        maxRecipientDenomination: reloadlyProduct.maxRecipientDenomination ?? reloadlyProduct.maxValue ?? null,
        senderCurrencyCode: reloadlyProduct.senderCurrencyCode ?? null,
        minSenderDenomination: reloadlyProduct.minSenderDenomination ?? null,
        maxSenderDenomination: reloadlyProduct.maxSenderDenomination ?? null,
        fixedRecipientDenominations: reloadlyProduct.fixedRecipientDenominations || [],
        fixedSenderDenominations: reloadlyProduct.fixedSenderDenominations || null,
        fixedRecipientToSenderDenominationsMap: reloadlyProduct.fixedRecipientToSenderDenominationsMap || null,
        metadata: reloadlyProduct.metadata || null,
        logoUrls: reloadlyProduct.logoUrls || (reloadlyProduct.logoUrl ? [reloadlyProduct.logoUrl] : []),
        brand: reloadlyProduct.brand ? {
          brandId: reloadlyProduct.brand.brandId,
          brandName: reloadlyProduct.brand.brandName,
          logoUrl: reloadlyProduct.brand.logoUrl,
        } : (reloadlyProduct.brandName ? {
          brandId: null,
          brandName: reloadlyProduct.brandName,
          logoUrl: null,
        } : null),
        category: reloadlyProduct.category ? {
          id: reloadlyProduct.category.id,
          name: reloadlyProduct.category.name,
        } : (reloadlyProduct.productType ? {
          id: null,
          name: reloadlyProduct.productType,
        } : null),
        country: reloadlyProduct.country ? {
          isoName: reloadlyProduct.country.isoName,
          name: reloadlyProduct.country.name,
          flagUrl: reloadlyProduct.country.flagUrl,
        } : (reloadlyProduct.countryCode ? {
          isoName: reloadlyProduct.countryCode,
          name: null,
          flagUrl: null,
        } : null),
        redeemInstruction: reloadlyProduct.redeemInstruction || null,
        additionalRequirements: reloadlyProduct.additionalRequirements || null,
        recipientCurrencyToSenderCurrencyExchangeRate: reloadlyProduct.recipientCurrencyToSenderCurrencyExchangeRate ?? null,
        // Legacy fields for backward compatibility
        brandName: reloadlyProduct.brandName || reloadlyProduct.brand?.brandName || null,
        countryCode: reloadlyProduct.countryCode || reloadlyProduct.country?.isoName || null,
        currencyCode: reloadlyProduct.currencyCode || reloadlyProduct.recipientCurrencyCode,
        minValue: reloadlyProduct.minRecipientDenomination ?? reloadlyProduct.minValue ?? null,
        maxValue: reloadlyProduct.maxRecipientDenomination ?? reloadlyProduct.maxValue ?? null,
        fixedValue: reloadlyProduct.fixedRecipientDenominations?.[0] || reloadlyProduct.fixedSenderDenominations?.[0] || null,
        isVariableDenomination: !reloadlyProduct.fixedRecipientDenominations?.length && !reloadlyProduct.fixedSenderDenominations?.length,
        imageUrl: reloadlyProduct.logoUrls?.[0] || reloadlyProduct.logoUrl || null,
        productType: reloadlyProduct.productType || null,
        description: reloadlyProduct.description || null,
        redemptionInstructions: reloadlyProduct.redeemInstruction || null,
      };

      return new ApiResponse(200, formattedProduct, 'Product retrieved successfully').send(res);
    } catch (reloadlyError) {
      throw ApiError.notFound('Product not found');
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch product'));
  }
};

/**
 * Get available countries for a product
 */
export const getProductCountriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId } = req.params;

    // Get product from database
    const product = await prisma.giftCardProduct.findFirst({
      where: {
        OR: [
          { id: parseInt(productId, 10) },
          { reloadlyProductId: parseInt(productId, 10) },
        ],
      },
    });

    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    // If product is global, get all countries
    if (product.isGlobal) {
      const countries = await reloadlyCountriesService.getCountries();
      
      return new ApiResponse(200, {
        countries: countries.content.map((country: any) => ({
          code: country.isoName,
          name: country.name,
          currency: country.currencyCode,
          currencyName: country.currencyName,
          flag: country.flag,
        })),
      }, 'Countries retrieved successfully').send(res);
    }

    // If not global, return the product's country
    const country = await reloadlyCountriesService.getCountryByIso(product.countryCode);

    return new ApiResponse(200, {
      countries: [
        {
          code: country.isoName,
          name: country.name,
          currency: country.currencyCode,
          currencyName: country.currencyName,
          flag: country.flag,
        },
      ],
    }, 'Countries retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch countries'));
  }
};

/**
 * Get supported card types for a product
 */
export const getProductCardTypesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId } = req.params;

    // Get product from database
    const product = await prisma.giftCardProduct.findFirst({
      where: {
        OR: [
          { id: parseInt(productId, 10) },
          { reloadlyProductId: parseInt(productId, 10) },
        ],
      },
    });

    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    // Get card types from product metadata or use defaults
    const cardTypes = product.supportedCardTypes
      ? (typeof product.supportedCardTypes === 'string' 
          ? JSON.parse(product.supportedCardTypes) 
          : product.supportedCardTypes) as string[]
      : ['Physical', 'E-Code', 'Code Only'];

    const formattedCardTypes = cardTypes.map((type) => ({
      type,
      description: getCardTypeDescription(type),
      available: true,
    }));

    return new ApiResponse(200, {
      cardTypes: formattedCardTypes,
    }, 'Card types retrieved successfully').send(res);
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.internal('Failed to fetch card types'));
  }
};

/**
 * Get all countries from Reloadly
 * GET /api/v2/giftcards/countries
 */
export const getCountriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const countriesResponse = await reloadlyCountriesService.getCountries();

    // Service always returns ReloadlyCountriesResponse with content property
    const countriesArray = countriesResponse.content || [];

    if (!Array.isArray(countriesArray)) {
      console.error('Unexpected countries response structure:', countriesResponse);
      throw new Error('Invalid response structure from Reloadly countries API');
    }

    const formattedCountries = countriesArray.map((country) => ({
      isoName: country.isoName,
      name: country.name,
      currencyCode: country.currencyCode,
      currencyName: country.currencyName,
      flag: country.flag || null,
    }));

    const totalElements = countriesResponse.totalElements || formattedCountries.length;

    return new ApiResponse(200, {
      countries: formattedCountries,
      total: totalElements,
    }, 'Countries retrieved successfully').send(res);
  } catch (error: any) {
    // Log detailed error information
    console.error('Error in getCountriesController:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      response: error?.response?.data || error?.response,
      status: error?.response?.status || error?.status,
      statusText: error?.response?.statusText,
      error: error?.error,
      fullError: error,
    });

    if (error instanceof ApiError) {
      return next(error);
    }
    
    // Include more details in the error message
    const errorMessage = error?.message || 'Failed to fetch countries from Reloadly';
    const errorDetails = error?.response?.data || error?.error || error?.response;
    
    console.error('Reloadly API error details:', {
      errorMessage,
      errorDetails,
      status: error?.response?.status || error?.status,
    });
    
    next(ApiError.internal(`Failed to fetch countries from Reloadly: ${errorMessage}`));
  }
};

/**
 * Get all categories from Reloadly
 * GET /api/v2/giftcards/categories
 */
export const getCategoriesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const categories = await reloadlyCountriesService.getCategories();

    // Format response to match expected structure
    const formattedCategories = categories.map((category) => ({
      id: category.id,
      name: category.name,
      value: category.name, // For backward compatibility with product filtering
    }));

    return new ApiResponse(200, {
      categories: formattedCategories,
      total: formattedCategories.length,
    }, 'Categories retrieved successfully').send(res);
  } catch (error: any) {
    // Log detailed error information
    console.error('Error in getCategoriesController:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      response: error?.response?.data || error?.response,
      status: error?.response?.status || error?.status,
      statusText: error?.response?.statusText,
      error: error?.error,
      fullError: error,
    });

    if (error instanceof ApiError) {
      return next(error);
    }
    
    const errorMessage = error?.message || 'Failed to fetch categories from Reloadly';
    console.error('Reloadly API error details:', {
      errorMessage,
      errorDetails: error?.response?.data || error?.error || error?.response,
      status: error?.response?.status || error?.status,
    });
    
    next(ApiError.internal(`Failed to fetch categories from Reloadly: ${errorMessage}`));
  }
};

/**
 * Helper function to get card type description
 */
function getCardTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    Physical: 'Physical card shipped to recipient',
    'E-Code': 'Digital code delivered via email',
    'Code Only': 'Code without card',
    'Paper Code': 'Paper code format',
    'Horizontal Card': 'Horizontal card format',
  };

  return descriptions[type] || 'Gift card code';
}

