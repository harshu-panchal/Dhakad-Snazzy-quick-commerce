import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  getPromoStrips,
  createPromoStrip,
  updatePromoStrip,
  type PromoStrip,
  type BannerMedia,
} from "../../../services/api/admin/adminPromoStripService";
import {
  getHeaderCategoriesAdmin,
  type HeaderCategory,
} from "../../../services/api/headerCategoryService";
import { uploadImage, uploadVideo } from "../../../services/api/uploadService";
import { resolveMediaUrl } from "../../../utils/media";

export default function AdminPromoStrip() {
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
  const [promoStrips, setPromoStrips] = useState<PromoStrip[]>([]);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>("");
  const [modalError, setModalError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Modal State for Add / Edit Slide
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null);

  // Slide Form State
  const [slideType, setSlideType] = useState<"image" | "video">("image");
  const [slideMediaUrl, setSlideMediaUrl] = useState("");
  const [slideThumbnailUrl, setSlideThumbnailUrl] = useState("");
  const [slideTitle, setSlideTitle] = useState("");
  const [slideSubtitle, setSlideSubtitle] = useState("");
  const [slideLink, setSlideLink] = useState("");
  const [slideButtonText, setSlideButtonText] = useState("Shop Now");
  const [slideOrder, setSlideOrder] = useState<number>(0);
  const [slideIsActive, setSlideIsActive] = useState(true);
  const [uploadSourceType, setUploadSourceType] = useState<"upload" | "url">("upload");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [cats, strips] = await Promise.all([
        getHeaderCategoriesAdmin(),
        getPromoStrips(),
      ]);
      setHeaderCategories(cats || []);
      setPromoStrips(strips || []);
    } catch (err: unknown) {
      console.error("Failed to load promo strip data:", err);
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to load data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Find the PromoStrip document for the currently selected header category
  const currentPromoStrip = useMemo(() => {
    return promoStrips.find(
      (s) => (s.headerCategorySlug || "").toLowerCase() === selectedCategorySlug.toLowerCase()
    );
  }, [promoStrips, selectedCategorySlug]);

  const currentBanners: BannerMedia[] = useMemo(() => {
    if (!currentPromoStrip?.banners) return [];
    return [...currentPromoStrip.banners].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [currentPromoStrip]);

  // Open modal to add new slide
  const handleOpenAddModal = () => {
    setEditingSlideIndex(null);
    setSlideType("image");
    setSlideMediaUrl("");
    setSlideThumbnailUrl("");
    setSlideTitle("");
    setSlideSubtitle("");
    setSlideLink(`/category/${selectedCategorySlug !== "all" ? selectedCategorySlug : "all"}`);
    setSlideButtonText("Shop Now");
    setSlideOrder(currentBanners.length);
    setSlideIsActive(true);
    setUploadSourceType("upload");
    setError("");
    setModalError("");
    setIsModalOpen(true);
  };

  // Open modal to edit existing slide
  const handleOpenEditModal = (slide: BannerMedia, index: number) => {
    setEditingSlideIndex(index);
    setSlideType(slide.type || "image");
    setSlideMediaUrl(slide.mediaUrl || "");
    setSlideThumbnailUrl(slide.thumbnailUrl || "");
    setSlideTitle(slide.title || "");
    setSlideSubtitle(slide.subtitle || "");
    setSlideLink(slide.link || "");
    setSlideButtonText(slide.buttonText || "Shop Now");
    setSlideOrder(slide.order !== undefined ? slide.order : index);
    setSlideIsActive(slide.isActive !== false);
    setUploadSourceType("url");
    setError("");
    setModalError("");
    setIsModalOpen(true);
  };

  // Handle media file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file triggers onChange
    e.target.value = "";

    try {
      setUploading(true);
      setModalError("");
      setError("");

      if (slideType === "video") {
        const isVideo =
          file.type.startsWith("video/") ||
          /\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp)$/i.test(file.name);

        if (!isVideo) {
          setModalError("Please select a valid video file (MP4, WebM, MOV, MKV)");
          return;
        }

        const maxVideoSize = 200 * 1024 * 1024; // 200MB
        if (file.size > maxVideoSize) {
          setModalError(
            `Video file exceeds 200MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`
          );
          return;
        }

        // Show immediate local preview while uploading
        const localPreview = URL.createObjectURL(file);
        setSlideMediaUrl(localPreview);

        const result = await uploadVideo(file, "banners/videos");
        const finalUrl = result.url || result.secureUrl;
        setSlideMediaUrl(finalUrl);
      } else {
        const isImage =
          file.type.startsWith("image/") ||
          /\.(jpe?g|png|webp|gif|svg)$/i.test(file.name);

        if (!isImage) {
          setModalError("Please select a valid image file (JPG, PNG, WebP, GIF)");
          return;
        }

        const maxImageSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxImageSize) {
          setModalError(
            `Image file exceeds 50MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`
          );
          return;
        }

        // Show immediate local preview
        const localPreview = URL.createObjectURL(file);
        setSlideMediaUrl(localPreview);

        const result = await uploadImage(file, "banners/images");
        const finalUrl = result.url || result.secureUrl;
        setSlideMediaUrl(finalUrl);
      }
    } catch (err: unknown) {
      console.error("Upload error:", err);
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Failed to upload file. Please check file format and size.";
      setModalError(msg);
      setSlideMediaUrl("");
    } finally {
      setUploading(false);
    }
  };

  // Save current slide to the selected category PromoStrip
  const handleSaveSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slideMediaUrl) {
      setModalError("Please upload a media file or provide a valid Media URL.");
      return;
    }

    try {
      setSaving(true);
      setModalError("");
      setError("");

      const newSlide: BannerMedia = {
        type: slideType,
        mediaUrl: slideMediaUrl,
        thumbnailUrl: slideThumbnailUrl || undefined,
        title: slideTitle,
        subtitle: slideSubtitle,
        link: slideLink,
        buttonText: slideButtonText,
        order: Number(slideOrder) || 0,
        isActive: slideIsActive,
      };

      const updatedBanners: BannerMedia[] = [...(currentPromoStrip?.banners || [])];

      if (editingSlideIndex !== null) {
        // Update existing slide
        updatedBanners[editingSlideIndex] = {
          ...updatedBanners[editingSlideIndex],
          ...newSlide,
        };
      } else {
        // Add new slide
        updatedBanners.push(newSlide);
      }

      // Re-sort by order
      updatedBanners.sort((a, b) => (a.order || 0) - (b.order || 0));

      if (currentPromoStrip?._id) {
        // Update existing document
        await updatePromoStrip(currentPromoStrip._id, {
          headerCategorySlug: selectedCategorySlug.toLowerCase(),
          banners: updatedBanners,
          isActive: true,
        });
      } else {
        // Create new document for this category
        await createPromoStrip({
          headerCategorySlug: selectedCategorySlug.toLowerCase(),
          banners: updatedBanners,
          heading: "SPECIAL OFFERS",
          saleText: "SALE",
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          order: 0,
        });
      }

      setSuccess("Banner/Video slide saved successfully!");
      setIsModalOpen(false);
      await loadData();
      setTimeout(() => setSuccess(""), 3500);
    } catch (err: unknown) {
      console.error("Failed to save slide:", err);
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to save slide";
      setModalError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Delete slide
  const handleDeleteSlide = async (index: number) => {
    if (!window.confirm("Are you sure you want to delete this banner/video?")) return;
    if (!currentPromoStrip?._id) return;

    try {
      setSaving(true);
      setError("");

      const updatedBanners = currentBanners.filter((_, idx) => idx !== index);

      await updatePromoStrip(currentPromoStrip._id, {
        headerCategorySlug: selectedCategorySlug.toLowerCase(),
        banners: updatedBanners,
      });

      setSuccess("Slide deleted successfully!");
      await loadData();
      setTimeout(() => setSuccess(""), 3500);
    } catch (err: unknown) {
      console.error("Delete error:", err);
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to delete slide";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Toggle active status of a slide
  const handleToggleActive = async (index: number) => {
    if (!currentPromoStrip?._id) return;

    try {
      setSaving(true);
      const updatedBanners = [...currentBanners];
      updatedBanners[index].isActive = !updatedBanners[index].isActive;

      await updatePromoStrip(currentPromoStrip._id, {
        headerCategorySlug: selectedCategorySlug.toLowerCase(),
        banners: updatedBanners,
      });

      await loadData();
    } catch (err: unknown) {
      console.error("Toggle error:", err);
      setError("Failed to update slide status");
    } finally {
      setSaving(false);
    }
  };

  // Move slide up / down in order
  const handleMoveSlide = async (index: number, direction: "up" | "down") => {
    if (!currentPromoStrip?._id) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentBanners.length) return;

    try {
      setSaving(true);
      const updatedBanners = [...currentBanners];
      const temp = updatedBanners[index];
      updatedBanners[index] = updatedBanners[targetIndex];
      updatedBanners[targetIndex] = temp;

      // Re-assign order numbers
      updatedBanners.forEach((b, idx) => {
        b.order = idx;
      });

      await updatePromoStrip(currentPromoStrip._id, {
        headerCategorySlug: selectedCategorySlug.toLowerCase(),
        banners: updatedBanners,
      });

      await loadData();
    } catch (err: unknown) {
      console.error("Reorder error:", err);
      setError("Failed to reorder slides");
    } finally {
      setSaving(false);
    }
  };

  // All category tabs
  const categoryTabs = useMemo(() => {
    const defaultTabs = [{ slug: "all", name: "All (Default)" }];
    const otherTabs = headerCategories
      .filter((c) => c.slug !== "all" && c.status === "Published")
      .map((c) => ({
        slug: c.slug,
        name: c.name,
      }));
    return [...defaultTabs, ...otherTabs];
  }, [headerCategories]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
              Header Category Banners & Videos
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Configure carousel banner images and promotional videos shown separately for each header category page.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all active:scale-95 whitespace-nowrap"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Banner / Video</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-500 font-bold ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess("")} className="text-emerald-500 font-bold ml-2">×</button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-neutral-200">
        <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider px-2 mb-2">
          Select Header Category to Manage:
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categoryTabs.map((tab) => {
            const isSelected = selectedCategorySlug.toLowerCase() === tab.slug.toLowerCase();
            const strip = promoStrips.find(
              (s) => (s.headerCategorySlug || "").toLowerCase() === tab.slug.toLowerCase()
            );
            const count = strip?.banners?.length || 0;

            return (
              <button
                key={tab.slug}
                type="button"
                onClick={() => setSelectedCategorySlug(tab.slug)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                  isSelected
                    ? "bg-neutral-900 text-white shadow"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                <span>{tab.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isSelected ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slide Cards List */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900 capitalize">
              {selectedCategorySlug} Carousel Media ({currentBanners.length})
            </h2>
            <p className="text-xs text-neutral-500">
              Slides will cycle automatically in the header carousel when this category is selected.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200/60"
          >
            + Add Slide
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-neutral-400 text-sm animate-pulse">
            Loading banners and videos...
          </div>
        ) : currentBanners.length === 0 ? (
          <div className="py-12 px-4 text-center rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50">
            <div className="w-12 h-12 mx-auto rounded-full bg-neutral-200 flex items-center justify-center text-neutral-500 mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-neutral-800">
              No custom banners or videos yet for "{selectedCategorySlug}"
            </h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
              Curated default slides will be shown until you add custom slides. Click below to add your first banner or video!
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow"
            >
              + Add First Slide
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentBanners.map((banner, index) => (
              <div
                key={banner._id || index}
                className={`group relative rounded-2xl overflow-hidden border transition-all ${
                  banner.isActive !== false
                    ? "border-neutral-200 bg-white hover:shadow-md"
                    : "border-neutral-200 bg-neutral-50 opacity-60"
                }`}
              >
                {/* Media Preview Box */}
                <div className="relative h-44 bg-neutral-900 overflow-hidden flex items-center justify-center">
                  {banner.type === "video" ? (
                    <video
                      src={resolveMediaUrl(banner.mediaUrl)}
                      poster={resolveMediaUrl(banner.thumbnailUrl)}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      controls
                    />
                  ) : (
                    <img
                      src={resolveMediaUrl(banner.mediaUrl)}
                      alt={banner.title || "Banner"}
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2 z-10">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow ${
                        banner.type === "video"
                          ? "bg-purple-600 text-white"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      {banner.type === "video" ? "📹 VIDEO" : "🖼️ BANNER"}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="absolute top-2 right-2 z-10">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(index)}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full shadow ${
                        banner.isActive !== false
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "bg-neutral-500 text-white hover:bg-neutral-600"
                      }`}
                    >
                      {banner.isActive !== false ? "Active" : "Disabled"}
                    </button>
                  </div>
                </div>

                {/* Info & Details */}
                <div className="p-3.5 space-y-2">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 line-clamp-1">
                      {banner.title || "(Untitled Slide)"}
                    </h3>
                    {banner.subtitle && (
                      <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">
                        {banner.subtitle}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100">
                    <span className="truncate max-w-[160px]" title={banner.link || "No link"}>
                      🔗 {banner.link || "None"}
                    </span>
                    <span className="font-semibold text-neutral-400">Order: {banner.order || index}</span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between gap-1 pt-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0 || saving}
                        onClick={() => handleMoveSlide(index, "up")}
                        className="p-1 rounded hover:bg-neutral-100 text-neutral-500 disabled:opacity-30"
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === currentBanners.length - 1 || saving}
                        onClick={() => handleMoveSlide(index, "down")}
                        className="p-1 rounded hover:bg-neutral-100 text-neutral-500 disabled:opacity-30"
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(banner, index)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSlide(index)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD / EDIT SLIDE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">
                  {editingSlideIndex !== null ? "Edit Slide" : "Add Banner or Video"}
                </h3>
                <p className="text-xs text-neutral-500">
                  For category: <span className="font-bold uppercase">{selectedCategorySlug}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-200 hover:bg-neutral-300 flex items-center justify-center text-neutral-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveSlide} className="p-6 space-y-4">
              {/* Modal Error Alert */}
              {modalError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-red-500">⚠️</span>
                    <span>{modalError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalError("")}
                    className="text-red-500 hover:text-red-700 font-bold ml-2 text-base leading-none p-1"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Media Type Toggle */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                  Media Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSlideType("image");
                      setModalError("");
                    }}
                    className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition-all ${
                      slideType === "image"
                        ? "bg-blue-50 border-blue-500 text-blue-700 shadow-sm"
                        : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    <span>🖼️ Image Banner</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSlideType("video");
                      setModalError("");
                    }}
                    className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition-all ${
                      slideType === "video"
                        ? "bg-purple-50 border-purple-500 text-purple-700 shadow-sm"
                        : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    <span>📹 Video Slide</span>
                  </button>
                </div>
              </div>

              {/* Upload vs URL Tabs */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-neutral-700">
                    {slideType === "video" ? "Video Media Source" : "Banner Image Source"}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadSourceType("upload")}
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        uploadSourceType === "upload"
                          ? "bg-neutral-900 text-white"
                          : "text-neutral-500 hover:text-neutral-900"
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadSourceType("url")}
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        uploadSourceType === "url"
                          ? "bg-neutral-900 text-white"
                          : "text-neutral-500 hover:text-neutral-900"
                      }`}
                    >
                      Media URL
                    </button>
                  </div>
                </div>

                {uploadSourceType === "upload" ? (
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                      uploading
                        ? "border-emerald-400 bg-emerald-50/30 cursor-wait"
                        : "border-neutral-300 hover:border-emerald-500 cursor-pointer bg-neutral-50/50 hover:bg-emerald-50/20"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={
                        slideType === "video"
                          ? "video/*,.mp4,.webm,.mov,.mkv,.m4v"
                          : "image/*,.png,.jpg,.jpeg,.webp"
                      }
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                    {uploading ? (
                      <div className="py-2 flex flex-col items-center justify-center gap-2">
                        <div className="w-7 h-7 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        <div className="text-xs text-neutral-700 font-semibold animate-pulse">
                          Uploading {slideType}... Please wait.
                        </div>
                        <p className="text-[10px] text-neutral-400">
                          {slideType === "video"
                            ? "Video processing may take a few moments depending on file size"
                            : "Uploading image..."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl mb-1">{slideType === "video" ? "📹" : "📁"}</div>
                        <p className="text-xs font-semibold text-neutral-800">
                          Click to upload {slideType === "video" ? "video file (MP4, WebM, MOV, MKV)" : "banner image"}
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-1">
                          {slideType === "video"
                            ? "Max size: 200MB • Recommended aspect ratio: 16:9 or 21:9"
                            : "Max size: 50MB • Recommended aspect ratio: 16:9 or 21:9"}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <input
                    type="url"
                    value={slideMediaUrl}
                    onChange={(e) => setSlideMediaUrl(e.target.value)}
                    placeholder={
                      slideType === "video"
                        ? "https://example.com/video.mp4 or /assets/..."
                        : "https://example.com/banner.jpg"
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                )}

                {/* Media Live Preview */}
                {slideMediaUrl && (
                  <div className="mt-2.5 rounded-xl overflow-hidden border border-neutral-200 bg-black h-40 flex items-center justify-center relative group">
                    {slideType === "video" ? (
                      <video
                        src={resolveMediaUrl(slideMediaUrl)}
                        controls
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img
                        src={resolveMediaUrl(slideMediaUrl)}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-medium px-2 py-0.5 rounded backdrop-blur">
                      Live Preview
                    </span>
                    <button
                      type="button"
                      onClick={() => setSlideMediaUrl("")}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow"
                      title="Remove media"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              {/* Title & Subtitle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Headline / Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={slideTitle}
                    onChange={(e) => setSlideTitle(e.target.value)}
                    placeholder="e.g. Summer Fashion 2026"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Subtitle / Offer Tag (Optional)
                  </label>
                  <input
                    type="text"
                    value={slideSubtitle}
                    onChange={(e) => setSlideSubtitle(e.target.value)}
                    placeholder="e.g. Flat 60% OFF Today"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Target Link & Button Text */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Target Route / Link
                  </label>
                  <input
                    type="text"
                    value={slideLink}
                    onChange={(e) => setSlideLink(e.target.value)}
                    placeholder="/category/fashion or /product/123"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Button Text
                  </label>
                  <input
                    type="text"
                    value={slideButtonText}
                    onChange={(e) => setSlideButtonText(e.target.value)}
                    placeholder="Shop Now"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Order & Active */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={slideOrder}
                    onChange={(e) => setSlideOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={slideIsActive}
                      onChange={(e) => setSlideIsActive(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-neutral-300 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold text-neutral-700">Slide is Active</span>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 text-xs sm:text-sm font-semibold hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading Media...</span>
                    </>
                  ) : saving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    "Save Slide"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
