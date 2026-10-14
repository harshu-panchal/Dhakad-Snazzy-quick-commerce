import { useState, useEffect, useMemo } from "react";
import {
    getLowestPricesSections,
    getServiceableCities,
    createLowestPricesSection,
    updateLowestPricesSection,
    deleteLowestPricesSection,
    addProductToSection,
    updateSectionProduct,
    removeProductFromSection,
    type LowestPricesSection,
    type LowestPricesSectionFormData,
    type LowestPricesSectionProductItem,
} from "../../../services/api/admin/adminLowestPricesService";
import { getProducts, type Product } from "../../../services/api/admin/adminProductService";

export default function AdminLowestPrices() {
    // Sections state
    const [sections, setSections] = useState<LowestPricesSection[]>([]);
    const [selectedSectionId, setSelectedSectionId] = useState<string>("");
    const [serviceableCities, setServiceableCities] = useState<string[]>(["All Cities"]);
    const [loadingSections, setLoadingSections] = useState(true);

    // Section modal state
    const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
    const [editingSection, setEditingSection] = useState<LowestPricesSection | null>(null);
    const [sectionFormTitle, setSectionFormTitle] = useState("LOWEST PRICES EVER");
    const [sectionFormCity, setSectionFormCity] = useState("All Cities");
    const [isCustomCity, setIsCustomCity] = useState(false);
    const [customCityName, setCustomCityName] = useState("");
    const [sectionFormOrder, setSectionFormOrder] = useState<number | undefined>(undefined);
    const [sectionFormIsActive, setSectionFormIsActive] = useState(true);
    const [savingSection, setSavingSection] = useState(false);

    // Active section products form state
    const [selectedProduct, setSelectedProduct] = useState<string>("");
    const [order, setOrder] = useState<number | undefined>(undefined);
    const [isActive, setIsActive] = useState(true);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);

    // Available catalog products
    const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
    const [productSearchTerm, setProductSearchTerm] = useState("");
    const [tableSearchTerm, setTableSearchTerm] = useState("");

    // UI feedback state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Pagination
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    // Filter by city in header
    const [cityFilter, setCityFilter] = useState<string>("All");

    // Load initial data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoadingSections(true);
            const [citiesRes, sectionsRes, productsRes] = await Promise.all([
                getServiceableCities(),
                getLowestPricesSections(),
                getProducts({ limit: 1000, status: "Active" }),
            ]);

            if (citiesRes.success && Array.isArray(citiesRes.data)) {
                setServiceableCities(citiesRes.data);
            }

            if (sectionsRes.success && Array.isArray(sectionsRes.data)) {
                setSections(sectionsRes.data);
                if (sectionsRes.data.length > 0 && !selectedSectionId) {
                    setSelectedSectionId(sectionsRes.data[0]._id);
                }
            }

            if (productsRes.success && productsRes.data) {
                const productList = Array.isArray(productsRes.data) ? productsRes.data : [];
                setAvailableProducts(productList);
            }
        } catch (err: any) {
            console.error("Error loading lowest prices data:", err);
            setError("Failed to load initial data");
        } finally {
            setLoadingSections(false);
        }
    };

    const fetchSections = async () => {
        try {
            const res = await getLowestPricesSections();
            if (res.success && Array.isArray(res.data)) {
                setSections(res.data);
                // Ensure currently selected section exists
                if (res.data.length > 0) {
                    const exists = res.data.some((s) => s._id === selectedSectionId);
                    if (!exists) {
                        setSelectedSectionId(res.data[0]._id);
                    }
                }
            }
        } catch (err: any) {
            console.error("Error fetching sections:", err);
        }
    };

    // Current selected section
    const currentSection = useMemo(() => {
        return sections.find((s) => s._id === selectedSectionId) || sections[0] || null;
    }, [sections, selectedSectionId]);

    // Filtered sections for switcher tabs
    const filteredSections = useMemo(() => {
        if (!cityFilter || cityFilter === "All") return sections;
        return sections.filter((s) => s.city.toLowerCase() === cityFilter.toLowerCase());
    }, [sections, cityFilter]);

    // Products inside the currently selected section
    const sectionProducts = useMemo(() => {
        if (!currentSection || !Array.isArray(currentSection.products)) return [];
        return currentSection.products;
    }, [currentSection]);

    // Catalog products available to add (exclude products already in this section)
    const selectableProducts = useMemo(() => {
        const addedProductIds = new Set(
            sectionProducts.map((item) => {
                if (typeof item.product === "string") return item.product;
                return item.product?._id;
            }).filter(Boolean)
        );

        return availableProducts.filter((product) => {
            if (addedProductIds.has(product._id)) return false;
            if (productSearchTerm) {
                const searchLower = productSearchTerm.toLowerCase();
                return (
                    product.productName?.toLowerCase().includes(searchLower) ||
                    product._id.toLowerCase().includes(searchLower)
                );
            }
            return true;
        });
    }, [availableProducts, sectionProducts, productSearchTerm]);

    // Table products filtered by search
    const filteredTableProducts = useMemo(() => {
        if (!tableSearchTerm) return sectionProducts;
        const q = tableSearchTerm.toLowerCase();
        return sectionProducts.filter((item) => {
            const p = item.product;
            if (!p) return false;
            return (
                p.productName?.toLowerCase().includes(q) ||
                p._id?.toLowerCase().includes(q) ||
                (p.seller && typeof p.seller === "object" && p.seller.storeName?.toLowerCase().includes(q))
            );
        });
    }, [sectionProducts, tableSearchTerm]);

    // Pagination
    const totalPages = Math.ceil(filteredTableProducts.length / rowsPerPage) || 1;
    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredTableProducts.slice(start, start + rowsPerPage);
    }, [filteredTableProducts, currentPage, rowsPerPage]);

    // ==================== Section Modal Handlers ====================

    const openCreateSectionModal = () => {
        setEditingSection(null);
        setSectionFormTitle("LOWEST PRICES EVER");
        setSectionFormCity("All Cities");
        setIsCustomCity(false);
        setCustomCityName("");
        setSectionFormOrder(sections.length);
        setSectionFormIsActive(true);
        setError("");
        setIsSectionModalOpen(true);
    };

    const openEditSectionModal = (section: LowestPricesSection) => {
        setEditingSection(section);
        setSectionFormTitle(section.title);
        const cityExistsInList = serviceableCities.some(
            (c) => c.toLowerCase() === section.city.toLowerCase()
        );
        if (cityExistsInList) {
            setSectionFormCity(section.city);
            setIsCustomCity(false);
            setCustomCityName("");
        } else {
            setIsCustomCity(true);
            setCustomCityName(section.city);
        }
        setSectionFormOrder(section.order);
        setSectionFormIsActive(section.isActive);
        setError("");
        setIsSectionModalOpen(true);
    };

    const handleSaveSection = async () => {
        setError("");
        const targetCity = isCustomCity ? customCityName.trim() : sectionFormCity.trim();

        if (!targetCity) {
            setError("Please select or enter a city / location");
            return;
        }

        const formData: LowestPricesSectionFormData = {
            title: sectionFormTitle.trim() || "LOWEST PRICES EVER",
            city: targetCity,
            order: sectionFormOrder !== undefined ? sectionFormOrder : undefined,
            isActive: sectionFormIsActive,
        };

        try {
            setSavingSection(true);
            if (editingSection) {
                const res = await updateLowestPricesSection(editingSection._id, formData);
                if (res.success && res.data) {
                    setSuccess("Section updated successfully!");
                    setIsSectionModalOpen(false);
                    await fetchSections();
                } else {
                    setError(res.message || "Failed to update section");
                }
            } else {
                const res = await createLowestPricesSection(formData);
                if (res.success && res.data) {
                    setSuccess("New section created successfully!");
                    setIsSectionModalOpen(false);
                    await fetchSections();
                    setSelectedSectionId(res.data._id);
                } else {
                    setError(res.message || "Failed to create section");
                }
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to save section");
        } finally {
            setSavingSection(false);
        }
    };

    const handleDeleteSection = async (sectionId: string, sectionTitle: string) => {
        if (!window.confirm(`Are you sure you want to delete "${sectionTitle}"? This will remove all products in this section.`)) {
            return;
        }

        try {
            setLoading(true);
            const res = await deleteLowestPricesSection(sectionId);
            if (res.success) {
                setSuccess("Section deleted successfully!");
                await fetchSections();
            } else {
                setError(res.message || "Failed to delete section");
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to delete section");
        } finally {
            setLoading(false);
        }
    };

    // ==================== Product Form Handlers ====================

    const resetProductForm = () => {
        setSelectedProduct("");
        setOrder(undefined);
        setIsActive(true);
        setEditingProductId(null);
        setProductSearchTerm("");
    };

    const handleProductSubmit = async () => {
        if (!currentSection) {
            setError("Please create or select a section first");
            return;
        }

        setError("");
        setSuccess("");

        if (!selectedProduct && !editingProductId) {
            setError("Please select a product");
            return;
        }

        try {
            setLoading(true);
            if (editingProductId) {
                const res = await updateSectionProduct(currentSection._id, editingProductId, {
                    order,
                    isActive,
                });
                if (res.success) {
                    setSuccess("Product updated successfully in this section!");
                    resetProductForm();
                    await fetchSections();
                } else {
                    setError(res.message || "Failed to update product");
                }
            } else {
                const res = await addProductToSection(currentSection._id, {
                    product: selectedProduct,
                    order,
                    isActive,
                });
                if (res.success) {
                    setSuccess("Product added to section successfully!");
                    resetProductForm();
                    await fetchSections();
                } else {
                    setError(res.message || "Failed to add product");
                }
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to save product");
        } finally {
            setLoading(false);
        }
    };

    const handleEditProduct = (item: LowestPricesSectionProductItem) => {
        const prodId = typeof item.product === "string" ? item.product : item.product?._id;
        setSelectedProduct(prodId || "");
        setOrder(item.order);
        setIsActive(item.isActive);
        setEditingProductId(item._id || prodId || "");
        window.scrollTo({ top: 300, behavior: "smooth" });
    };

    const handleRemoveProduct = async (item: LowestPricesSectionProductItem) => {
        if (!currentSection) return;
        const prodId = typeof item.product === "string" ? item.product : item.product?._id;
        const targetId = item._id || prodId;
        if (!targetId) return;

        const prodName = typeof item.product === "object" ? item.product.productName : "this product";
        if (!window.confirm(`Remove "${prodName}" from ${currentSection.title}?`)) {
            return;
        }

        try {
            setLoading(true);
            const res = await removeProductFromSection(currentSection._id, targetId);
            if (res.success) {
                setSuccess("Product removed from section!");
                if (editingProductId === targetId) {
                    resetProductForm();
                }
                await fetchSections();
            } else {
                setError(res.message || "Failed to remove product");
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to remove product");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-100 p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-xs border border-neutral-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
                            <span>Admin</span>
                            <span>/</span>
                            <span>Home Sections</span>
                            <span>/</span>
                            <span className="text-teal-600 font-semibold">Lowest Prices Ever</span>
                        </div>
                        <h1 className="text-2xl font-bold text-neutral-800">Lowest Prices Ever Sections</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">
                            Manage multiple Lowest Prices Ever sections for different serviceable cities and locations.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={openCreateSectionModal}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors shadow-xs cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Create New Section
                        </button>
                    </div>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
                        <span>{error}</span>
                        <button onClick={() => setError("")} className="text-red-500 hover:text-red-700 font-bold ml-2">×</button>
                    </div>
                )}
                {success && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm flex items-center justify-between">
                        <span>{success}</span>
                        <button onClick={() => setSuccess("")} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">×</button>
                    </div>
                )}

                {/* Section Selector / City Tabs */}
                <div className="bg-white rounded-xl shadow-xs border border-neutral-200 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                Service Locations / Sections ({sections.length})
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500">Filter City:</span>
                            <select
                                value={cityFilter}
                                onChange={(e) => setCityFilter(e.target.value)}
                                className="text-xs border border-neutral-300 rounded px-2.5 py-1 bg-white outline-none focus:border-teal-500"
                            >
                                <option value="All">All Cities ({sections.length})</option>
                                {serviceableCities.map((city) => (
                                    <option key={city} value={city}>{city}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Section Switcher Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-3">
                        {loadingSections ? (
                            <div className="col-span-full py-6 text-center text-sm text-neutral-400">
                                Loading sections...
                            </div>
                        ) : filteredSections.length === 0 ? (
                            <div className="col-span-full py-6 text-center text-sm text-neutral-400">
                                No sections found. Click "+ Create New Section" to add one!
                            </div>
                        ) : (
                            filteredSections.map((sec) => {
                                const isSelected = sec._id === selectedSectionId;
                                const prodCount = Array.isArray(sec.products) ? sec.products.length : 0;
                                return (
                                    <div
                                        key={sec._id}
                                        onClick={() => {
                                            setSelectedSectionId(sec._id);
                                            resetProductForm();
                                            setCurrentPage(1);
                                        }}
                                        className={`group relative p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                                            isSelected
                                                ? "border-teal-600 bg-teal-50/50 shadow-xs ring-1 ring-teal-500"
                                                : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-xs"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className={`w-2 h-2 rounded-full ${sec.isActive ? "bg-emerald-500" : "bg-neutral-300"}`} />
                                                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider truncate">
                                                        📍 {sec.city}
                                                    </span>
                                                </div>
                                                <h3 className="text-sm font-bold text-neutral-900 truncate">
                                                    {sec.title}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="inline-flex items-center text-xs font-medium text-teal-700 bg-teal-100/70 px-2 py-0.5 rounded">
                                                        {prodCount} products
                                                    </span>
                                                    <span className="text-[11px] text-neutral-400">
                                                        Order #{sec.order}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEditSectionModal(sec);
                                                    }}
                                                    className="p-1 text-neutral-400 hover:text-blue-600 rounded transition-colors"
                                                    title="Edit Section Settings"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteSection(sec._id, sec.title);
                                                    }}
                                                    className="p-1 text-neutral-400 hover:text-red-600 rounded transition-colors"
                                                    title="Delete Section"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Main Content for the Active Section */}
                {currentSection && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column: Add / Edit Product in this section */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-xs border border-neutral-200 p-5 sticky top-6">
                                <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
                                    <div>
                                        <h2 className="text-base font-bold text-neutral-800">
                                            {editingProductId ? "Edit Section Product" : "Add Product to Section"}
                                        </h2>
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                            Section: <strong className="text-teal-700">{currentSection.title}</strong> (📍 {currentSection.city})
                                        </p>
                                    </div>
                                    {editingProductId && (
                                        <button
                                            onClick={resetProductForm}
                                            className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {/* Product Selector */}
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                                            Product <span className="text-red-500">*</span>
                                        </label>
                                        {!editingProductId ? (
                                            <>
                                                <input
                                                    type="text"
                                                    placeholder="Search catalog products..."
                                                    value={productSearchTerm}
                                                    onChange={(e) => setProductSearchTerm(e.target.value)}
                                                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none mb-2"
                                                />
                                                <div className="border border-neutral-200 rounded-lg max-h-48 overflow-y-auto bg-neutral-50 divide-y divide-neutral-100">
                                                    {selectableProducts.length === 0 ? (
                                                        <p className="text-xs text-neutral-400 p-3 text-center">
                                                            {productSearchTerm
                                                                ? "No matching products found"
                                                                : "All catalog products are already added to this section"}
                                                        </p>
                                                    ) : (
                                                        selectableProducts.slice(0, 30).map((product) => (
                                                            <button
                                                                key={product._id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedProduct(product._id);
                                                                    setProductSearchTerm("");
                                                                }}
                                                                className={`w-full text-left px-3 py-2.5 hover:bg-neutral-100 transition-colors flex items-center gap-2.5 ${
                                                                    selectedProduct === product._id
                                                                        ? "bg-teal-50 border-l-4 border-teal-600"
                                                                        : ""
                                                                }`}
                                                            >
                                                                {product.mainImage ? (
                                                                    <img
                                                                        src={product.mainImage}
                                                                        alt=""
                                                                        className="w-8 h-8 rounded object-cover shrink-0 border border-neutral-200"
                                                                    />
                                                                ) : (
                                                                    <div className="w-8 h-8 rounded bg-neutral-200 shrink-0" />
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-xs font-medium text-neutral-900 truncate">
                                                                        {product.productName}
                                                                    </div>
                                                                    <div className="text-[11px] text-neutral-500">
                                                                        ₹{product.price?.toLocaleString("en-IN")}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                                {selectedProduct && (
                                                    <div className="mt-2 p-2 bg-teal-50 border border-teal-200 rounded text-xs text-teal-800 flex items-center justify-between">
                                                        <span className="truncate">
                                                            Selected:{" "}
                                                            <strong>
                                                                {availableProducts.find((p) => p._id === selectedProduct)?.productName}
                                                            </strong>
                                                        </span>
                                                        <button
                                                            onClick={() => setSelectedProduct("")}
                                                            className="text-teal-600 hover:text-teal-900 font-bold ml-1"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-100 text-xs font-medium text-neutral-800 truncate">
                                                {availableProducts.find((p) => p._id === selectedProduct)?.productName ||
                                                    (typeof currentSection.products.find((p) => (p._id || (p.product as any)?._id) === editingProductId)?.product === "object"
                                                        ? (currentSection.products.find((p) => (p._id || (p.product as any)?._id) === editingProductId)?.product as any)?.productName
                                                        : "Product Selected")}
                                            </div>
                                        )}
                                    </div>

                                    {/* Order */}
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                                            Display Order
                                        </label>
                                        <input
                                            type="number"
                                            value={order !== undefined ? order : ""}
                                            onChange={(e) =>
                                                setOrder(e.target.value ? Number(e.target.value) : undefined)
                                            }
                                            placeholder="Auto-assign at end"
                                            min="0"
                                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                                        />
                                        <p className="text-[11px] text-neutral-400 mt-1">
                                            Leave empty to auto-append at end of section.
                                        </p>
                                    </div>

                                    {/* Active Status */}
                                    <div>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={isActive}
                                                onChange={(e) => setIsActive(e.target.checked)}
                                                className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-neutral-300 rounded"
                                            />
                                            <span className="text-xs font-medium text-neutral-700">
                                                Active (Display in marquee)
                                            </span>
                                        </label>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="pt-2">
                                        <button
                                            onClick={handleProductSubmit}
                                            disabled={loading}
                                            className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                                                loading
                                                    ? "bg-neutral-400 cursor-not-allowed text-white"
                                                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
                                            }`}
                                        >
                                            {loading
                                                ? "Saving..."
                                                : editingProductId
                                                ? "Update Product in Section"
                                                : "Add Product to Section"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: View Products in Selected Section */}
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-xl shadow-xs border border-neutral-200 p-5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100 mb-4">
                                    <div>
                                        <h2 className="text-base font-bold text-neutral-800">
                                            Products in {currentSection.title}
                                        </h2>
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                            Location: 📍 <strong>{currentSection.city}</strong> • Total {sectionProducts.length} items
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Search items..."
                                            value={tableSearchTerm}
                                            onChange={(e) => {
                                                setTableSearchTerm(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                            className="px-3 py-1.5 text-xs border border-neutral-300 rounded-lg outline-none focus:border-teal-500"
                                        />
                                        <button
                                            onClick={() => openEditSectionModal(currentSection)}
                                            className="px-3 py-1.5 text-xs font-medium border border-neutral-300 hover:border-neutral-400 rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors"
                                        >
                                            Edit Section
                                        </button>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-neutral-200 text-neutral-500 font-semibold uppercase tracking-wider bg-neutral-50/70">
                                                <th className="py-2.5 px-3 w-16">Order</th>
                                                <th className="py-2.5 px-3">Product Name</th>
                                                <th className="py-2.5 px-3">Price</th>
                                                <th className="py-2.5 px-3 w-20">Status</th>
                                                <th className="py-2.5 px-3 w-24 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                            {paginatedProducts.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="py-8 text-center text-neutral-400">
                                                        {tableSearchTerm
                                                            ? "No products matched your search"
                                                            : "No products in this section yet. Use the form on the left to add products!"}
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedProducts.map((item, idx) => {
                                                    const prod = item.product;
                                                    const prodId = typeof prod === "string" ? prod : prod?._id;
                                                    const isItemEditing = editingProductId === (item._id || prodId);
                                                    return (
                                                        <tr
                                                            key={item._id || prodId || idx}
                                                            className={`hover:bg-neutral-50 transition-colors ${
                                                                isItemEditing ? "bg-teal-50/60" : ""
                                                            }`}
                                                        >
                                                            <td className="py-3 px-3 font-semibold text-neutral-600">
                                                                #{item.order}
                                                            </td>
                                                            <td className="py-3 px-3">
                                                                <div className="flex items-center gap-2.5">
                                                                    {prod?.mainImage ? (
                                                                        <img
                                                                            src={prod.mainImage}
                                                                            alt=""
                                                                            className="w-10 h-10 rounded object-cover border border-neutral-200 shrink-0"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-10 h-10 rounded bg-neutral-200 shrink-0" />
                                                                    )}
                                                                    <div className="min-w-0">
                                                                        <div className="font-semibold text-neutral-900 truncate">
                                                                            {prod?.productName || "Unknown Product"}
                                                                        </div>
                                                                        {prod?.seller?.storeName && (
                                                                            <div className="text-[11px] text-neutral-400 truncate">
                                                                                Store: {prod.seller.storeName}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-3">
                                                                <div className="font-semibold text-neutral-800">
                                                                    ₹{(prod?.discPrice || prod?.price || 0).toLocaleString("en-IN")}
                                                                </div>
                                                                {prod?.mrp && prod.mrp > (prod.discPrice || prod.price) && (
                                                                    <div className="text-[11px] text-neutral-400 line-through">
                                                                        ₹{prod.mrp.toLocaleString("en-IN")}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-3">
                                                                <span
                                                                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                                        item.isActive
                                                                            ? "bg-emerald-100 text-emerald-800"
                                                                            : "bg-neutral-100 text-neutral-600"
                                                                    }`}
                                                                >
                                                                    {item.isActive ? "Active" : "Inactive"}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-3 text-right">
                                                                <div className="inline-flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => handleEditProduct(item)}
                                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                        title="Edit order/status"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                        </svg>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRemoveProduct(item)}
                                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                        title="Remove from section"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination Controls */}
                                {filteredTableProducts.length > 0 && (
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-neutral-100 mt-4 text-xs text-neutral-500">
                                        <div className="flex items-center gap-2">
                                            <span>Show</span>
                                            <select
                                                value={rowsPerPage}
                                                onChange={(e) => {
                                                    setRowsPerPage(Number(e.target.value));
                                                    setCurrentPage(1);
                                                }}
                                                className="border border-neutral-300 rounded px-2 py-1 bg-white outline-none"
                                            >
                                                <option value={10}>10</option>
                                                <option value={20}>20</option>
                                                <option value={50}>50</option>
                                            </select>
                                            <span>entries (Total: {filteredTableProducts.length})</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                                disabled={currentPage === 1}
                                                className="px-2.5 py-1 rounded border border-neutral-300 disabled:opacity-40 hover:bg-neutral-50"
                                            >
                                                Previous
                                            </button>
                                            <span className="px-2">
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <button
                                                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                                disabled={currentPage === totalPages}
                                                className="px-2.5 py-1 rounded border border-neutral-300 disabled:opacity-40 hover:bg-neutral-50"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Section Create / Edit Modal */}
            {isSectionModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-lg w-full p-6 animate-scale-in">
                        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                            <div>
                                <h3 className="text-lg font-bold text-neutral-900">
                                    {editingSection ? "Edit Section Settings" : "Create Lowest Prices Section"}
                                </h3>
                                <p className="text-xs text-neutral-500 mt-0.5">
                                    Configure location, name, and display order.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsSectionModalOpen(false)}
                                className="text-neutral-400 hover:text-neutral-600 text-lg font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 py-4">
                            {/* Section Title */}
                            <div>
                                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                                    Section Title <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={sectionFormTitle}
                                    onChange={(e) => setSectionFormTitle(e.target.value)}
                                    placeholder="e.g. LOWEST PRICES EVER"
                                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                />
                                <p className="text-[11px] text-neutral-400 mt-1">
                                    Displays as the marquee heading on the home page.
                                </p>
                            </div>

                            {/* Serviceable City / Location */}
                            <div>
                                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                                    Service Location / City <span className="text-red-500">*</span>
                                </label>
                                {!isCustomCity ? (
                                    <div className="space-y-2">
                                        <select
                                            value={sectionFormCity}
                                            onChange={(e) => {
                                                if (e.target.value === "__CUSTOM__") {
                                                    setIsCustomCity(true);
                                                    setCustomCityName("");
                                                } else {
                                                    setSectionFormCity(e.target.value);
                                                }
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                        >
                                            {serviceableCities.map((city) => (
                                                <option key={city} value={city}>
                                                    {city === "All Cities" ? "🌐 All Cities (Default / Fallback)" : `📍 ${city}`}
                                                </option>
                                            ))}
                                            <option value="__CUSTOM__">➕ Enter Custom City / Area...</option>
                                        </select>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Enter City Name (e.g. Indore, Bhopal)"
                                                value={customCityName}
                                                onChange={(e) => setCustomCityName(e.target.value)}
                                                className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsCustomCity(false);
                                                    setSectionFormCity("All Cities");
                                                }}
                                                className="px-3 py-2 text-xs border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-50"
                                            >
                                                Select list
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <p className="text-[11px] text-neutral-400 mt-1">
                                    Customers in this city will automatically see this section. "All Cities" serves as the global fallback.
                                </p>
                            </div>

                            {/* Section Order */}
                            <div>
                                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                                    Section Priority / Order
                                </label>
                                <input
                                    type="number"
                                    value={sectionFormOrder !== undefined ? sectionFormOrder : ""}
                                    onChange={(e) =>
                                        setSectionFormOrder(e.target.value ? Number(e.target.value) : undefined)
                                    }
                                    placeholder="0"
                                    min="0"
                                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                />
                            </div>

                            {/* Active Status */}
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={sectionFormIsActive}
                                        onChange={(e) => setSectionFormIsActive(e.target.checked)}
                                        className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-neutral-300 rounded"
                                    />
                                    <span className="text-xs font-medium text-neutral-700">
                                        Active (Show section on customer homepage)
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
                            <button
                                type="button"
                                onClick={() => setIsSectionModalOpen(false)}
                                className="px-4 py-2 text-xs font-medium border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveSection}
                                disabled={savingSection}
                                className={`px-4 py-2 text-xs font-medium rounded-lg text-white ${
                                    savingSection
                                        ? "bg-neutral-400 cursor-not-allowed"
                                        : "bg-teal-600 hover:bg-teal-700"
                                }`}
                            >
                                {savingSection ? "Saving..." : editingSection ? "Save Changes" : "Create Section"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
