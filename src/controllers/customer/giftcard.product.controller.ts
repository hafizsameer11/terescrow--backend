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

    // Format response to match expected structure
    const formattedProducts = allProducts.map((product) => ({
      productId: product.productId,
      id: product.productId.toString(), // Use Reloadly productId as id
      productName: product.productName,
      brandName: product.brandName || null,
      countryCode: product.countryCode || null,
      currencyCode: product.currencyCode,
      minValue: product.minValue || null,
      maxValue: product.maxValue || null,
      fixedValue: product.fixedRecipientDenominations?.[0] || product.fixedSenderDenominations?.[0] || null,
      isVariableDenomination: !product.fixedRecipientDenominations && !product.fixedSenderDenominations,
      imageUrl: product.logoUrls?.[0] || product.logoUrl || null, // Use Reloadly logo
      category: product.productType || null,
      status: 'active', // Reloadly products are active by default
      description: product.description || null,
      redeemInstruction: product.redeemInstruction || null,
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

    // Try database first
    const product = await prisma.giftCardProduct.findFirst({
      where: {
        OR: [
          { id: parseInt(productId, 10) },
          { reloadlyProductId: parseInt(productId, 10) },
        ],
      },
      include: {
        productCountries: true,
      },
    });

    if (!product) {
      // Try fetching from Reloadly
      try {
        const reloadlyProduct = await reloadlyProductsService.getProductById(
          parseInt(productId, 10)
        );

        return new ApiResponse(200, {
          productId: reloadlyProduct.productId,
          productName: reloadlyProduct.productName,
          brandName: reloadlyProduct.brandName,
          countryCode: reloadlyProduct.countryCode,
          currencyCode: reloadlyProduct.currencyCode,
          minValue: reloadlyProduct.minValue,
          maxValue: reloadlyProduct.maxValue,
          imageUrl: reloadlyProduct.logoUrl || (reloadlyProduct.logoUrls && reloadlyProduct.logoUrls[0]) || null,
          isGlobal: reloadlyProduct.isGlobal,
          productType: reloadlyProduct.productType,
          description: reloadlyProduct.description,
          redemptionInstructions: reloadlyProduct.redeemInstruction,
        }, 'Product retrieved successfully').send(res);
      } catch (reloadlyError) {
        throw ApiError.notFound('Product not found');
      }
    }

    // Format response
    const formattedProduct = {
      productId: product.reloadlyProductId,
      id: product.id,
      productName: product.productName,
      brandName: product.brandName,
      countryCode: product.countryCode,
      currencyCode: product.currencyCode,
      minValue: product.minValue,
      maxValue: product.maxValue,
      fixedValue: product.fixedValue,
      isVariableDenomination: product.isVariableDenomination,
      isGlobal: product.isGlobal,
      imageUrl: product.reloadlyImageUrl || product.imageUrl || null,
      category: product.category,
      productType: product.productType,
      description: product.description,
      redemptionInstructions: product.redemptionInstructions,
      supportedCardTypes: product.supportedCardTypes
        ? (typeof product.supportedCardTypes === 'string' 
            ? JSON.parse(product.supportedCardTypes) 
            : product.supportedCardTypes) as string[]
        : ['Physical', 'E-Code', 'Code Only'],
    };

    return new ApiResponse(200, formattedProduct, 'Product retrieved successfully').send(res);
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
        countries: countries.content.map((country) => ({
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

