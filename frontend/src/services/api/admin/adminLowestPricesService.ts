import api from "../config";

export interface LowestPricesSectionProductItem {
    _id?: string;
    product: {
        _id: string;
        productName: string;
        mainImage?: string;
        price: number;
        discPrice?: number;
        compareAtPrice?: number;
        mrp?: number;
        discount?: number;
        status: string;
        publish: boolean;
        seller?: {
            _id?: string;
            storeName?: string;
            sellerName?: string;
            viewCustomerDetails?: boolean;
        };
        shopId?: {
            _id?: string;
            name?: string;
        };
    };
    order: number;
    isActive: boolean;
}

export interface LowestPricesSection {
    _id: string;
    title: string;
    city: string;
    order: number;
    isActive: boolean;
    products: LowestPricesSectionProductItem[];
    createdAt?: string;
    updatedAt?: string;
}

export interface LowestPricesSectionFormData {
    title: string;
    city: string;
    order?: number;
    isActive?: boolean;
}

export interface LowestPricesSectionResponse {
    success: boolean;
    message?: string;
    data?: LowestPricesSection;
}

export interface LowestPricesSectionsResponse {
    success: boolean;
    message?: string;
    data?: LowestPricesSection[];
}

export interface ServiceableCitiesResponse {
    success: boolean;
    message?: string;
    data?: string[];
}

// ==================== Section API Methods ====================

export const getLowestPricesSections = async (
    city?: string
): Promise<LowestPricesSectionsResponse> => {
    const params = city && city !== "All" ? { city } : {};
    const response = await api.get<LowestPricesSectionsResponse>(
        "/admin/lowest-prices-sections",
        { params }
    );
    return response.data;
};

export const getServiceableCities = async (): Promise<ServiceableCitiesResponse> => {
    const response = await api.get<ServiceableCitiesResponse>(
        "/admin/lowest-prices-sections/cities"
    );
    return response.data;
};

export const getLowestPricesSectionById = async (
    id: string
): Promise<LowestPricesSectionResponse> => {
    const response = await api.get<LowestPricesSectionResponse>(
        `/admin/lowest-prices-sections/${id}`
    );
    return response.data;
};

export const createLowestPricesSection = async (
    data: LowestPricesSectionFormData
): Promise<LowestPricesSectionResponse> => {
    const response = await api.post<LowestPricesSectionResponse>(
        "/admin/lowest-prices-sections",
        data
    );
    return response.data;
};

export const updateLowestPricesSection = async (
    id: string,
    data: Partial<LowestPricesSectionFormData>
): Promise<LowestPricesSectionResponse> => {
    const response = await api.put<LowestPricesSectionResponse>(
        `/admin/lowest-prices-sections/${id}`,
        data
    );
    return response.data;
};

export const deleteLowestPricesSection = async (
    id: string
): Promise<LowestPricesSectionResponse> => {
    const response = await api.delete<LowestPricesSectionResponse>(
        `/admin/lowest-prices-sections/${id}`
    );
    return response.data;
};

export const addProductToSection = async (
    sectionId: string,
    data: { product: string; order?: number; isActive?: boolean }
): Promise<LowestPricesSectionResponse> => {
    const response = await api.post<LowestPricesSectionResponse>(
        `/admin/lowest-prices-sections/${sectionId}/products`,
        data
    );
    return response.data;
};

export const updateSectionProduct = async (
    sectionId: string,
    productId: string,
    data: { order?: number; isActive?: boolean }
): Promise<LowestPricesSectionResponse> => {
    const response = await api.put<LowestPricesSectionResponse>(
        `/admin/lowest-prices-sections/${sectionId}/products/${productId}`,
        data
    );
    return response.data;
};

export const removeProductFromSection = async (
    sectionId: string,
    productId: string
): Promise<LowestPricesSectionResponse> => {
    const response = await api.delete<LowestPricesSectionResponse>(
        `/admin/lowest-prices-sections/${sectionId}/products/${productId}`
    );
    return response.data;
};

export const reorderSectionProducts = async (
    sectionId: string,
    products: { id: string; order: number }[]
): Promise<LowestPricesSectionResponse> => {
    const response = await api.put<LowestPricesSectionResponse>(
        `/admin/lowest-prices-sections/${sectionId}/products/reorder`,
        { products }
    );
    return response.data;
};

// ==================== Legacy Compatibility API Methods ====================

export interface LowestPricesProduct {
    _id: string;
    product: {
        _id: string;
        productName: string;
        mainImage?: string;
        price: number;
        mrp?: number;
        discount?: number;
        status: string;
        publish: boolean;
    };
    order: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface LowestPricesProductFormData {
    product: string;
    order?: number;
    isActive: boolean;
}

export interface LowestPricesProductResponse {
    success: boolean;
    message?: string;
    data?: LowestPricesProduct | LowestPricesProduct[];
}

export const getLowestPricesProducts = async (): Promise<LowestPricesProductResponse> => {
    const response = await api.get<LowestPricesProductResponse>("/admin/lowest-prices-products");
    return response.data;
};

export const getLowestPricesProductById = async (
    id: string
): Promise<LowestPricesProductResponse> => {
    const response = await api.get<LowestPricesProductResponse>(
        `/admin/lowest-prices-products/${id}`
    );
    return response.data;
};

export const createLowestPricesProduct = async (
    data: LowestPricesProductFormData
): Promise<LowestPricesProductResponse> => {
    const response = await api.post<LowestPricesProductResponse>(
        "/admin/lowest-prices-products",
        data
    );
    return response.data;
};

export const updateLowestPricesProduct = async (
    id: string,
    data: Partial<LowestPricesProductFormData>
): Promise<LowestPricesProductResponse> => {
    const response = await api.put<LowestPricesProductResponse>(
        `/admin/lowest-prices-products/${id}`,
        data
    );
    return response.data;
};

export const deleteLowestPricesProduct = async (
    id: string
): Promise<LowestPricesProductResponse> => {
    const response = await api.delete<LowestPricesProductResponse>(
        `/admin/lowest-prices-products/${id}`
    );
    return response.data;
};

export const reorderLowestPricesProducts = async (
    products: { id: string; order: number }[]
): Promise<LowestPricesProductResponse> => {
    const response = await api.put<LowestPricesProductResponse>(
        "/admin/lowest-prices-products/reorder",
        { products }
    );
    return response.data;
};
