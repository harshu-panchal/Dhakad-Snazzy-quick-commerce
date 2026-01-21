import { useState, useEffect } from 'react';
import { getSellerProfile, updateSellerProfile } from '../../../services/api/auth/sellerAuthService';
import { useAuth } from '../../../context/AuthContext';

export default function SellerAccountSettings() {
    const { isAuthenticated, updateUser } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const [formData, setFormData] = useState({
        sellerName: '',
        email: '',
        mobile: '',
        storeName: '',
        address: '',
        city: '',
    });

    // Fetch profile on mount
    useEffect(() => {
        if (!isAuthenticated) {
            setLoading(false);
            return;
        }

        const fetchProfile = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await getSellerProfile();
                if (response.success && response.data) {
                    setProfile(response.data);
                    setFormData({
                        sellerName: response.data.sellerName || '',
                        email: response.data.email || '',
                        mobile: response.data.mobile || '',
                        storeName: response.data.storeName || '',
                        address: response.data.address || '',
                        city: response.data.city || '',
                    });
                }
            } catch (err) {
                console.error('Error fetching profile:', err);
                setError('Failed to load profile. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [isAuthenticated]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            // Validation
            if (!formData.sellerName.trim()) {
                setError('Seller name is required.');
                return;
            }

            if (!formData.email.trim()) {
                setError('Email is required.');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
                setError('Please enter a valid email address.');
                return;
            }

            if (!formData.mobile.trim()) {
                setError('Mobile number is required.');
                return;
            }

            if (!/^[0-9]{10}$/.test(formData.mobile)) {
                setError('Mobile number must be 10 digits.');
                return;
            }

            const response = await updateSellerProfile(formData);
            if (response.success && response.data) {
                setProfile(response.data);
                setSuccess('Profile updated successfully!');
                setIsEditing(false);

                // Update AuthContext user data
                updateUser(response.data);

                // Clear success message after 3 seconds
                setTimeout(() => setSuccess(null), 3000);
            } else {
                setError(response.message || 'Failed to update profile.');
            }
        } catch (err: any) {
            console.error('Error updating profile:', err);
            if (err?.response?.data?.message) {
                setError(err.response.data.message);
            } else {
                setError('Failed to update profile. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        if (profile) {
            setFormData({
                sellerName: profile.sellerName || '',
                email: profile.email || '',
                mobile: profile.mobile || '',
                storeName: profile.storeName || '',
                address: profile.address || '',
                city: profile.city || '',
            });
        }
        setIsEditing(false);
        setError(null);
        setSuccess(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="p-8 text-center text-red-500 bg-white rounded-lg shadow-sm border border-neutral-200">
                Failed to load profile
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-white px-4 sm:px-6 py-4 border-b border-neutral-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
                            Account Settings
                        </h1>
                        <p className="text-sm text-neutral-500">Manage your store and profile information</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-50">
                <div className="max-w-4xl mx-auto">
                    {/* Success Message */}
                    {success && (
                        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded shadow-sm">
                            {success}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded shadow-sm">
                            {error}
                        </div>
                    )}

                    {/* Profile Card */}
                    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
                        {/* Card Header */}
                        <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-neutral-900">
                                Seller Information
                            </h2>
                            {!isEditing && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded transition-colors shadow-sm"
                                >
                                    Edit Profile
                                </button>
                            )}
                        </div>

                        {/* Card Body */}
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Seller Name */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                                        Seller Name
                                    </label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            name="sellerName"
                                            value={formData.sellerName}
                                            onChange={handleInputChange}
                                            className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="text-neutral-900 py-2 border-b border-transparent">{profile.sellerName}</p>
                                    )}
                                </div>

                                {/* Store Name */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                                        Store Name
                                    </label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            name="storeName"
                                            value={formData.storeName}
                                            onChange={handleInputChange}
                                            className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="text-neutral-900 py-2 border-b border-transparent">{profile.storeName}</p>
                                    )}
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                                        Email
                                    </label>
                                    {isEditing ? (
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="text-neutral-900 py-2 border-b border-transparent">{profile.email}</p>
                                    )}
                                </div>

                                {/* Mobile */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                                        Mobile
                                    </label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            name="mobile"
                                            value={formData.mobile}
                                            onChange={handleInputChange}
                                            maxLength={10}
                                            className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="text-neutral-900 py-2 border-b border-transparent">{profile.mobile}</p>
                                    )}
                                </div>

                                {/* City */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                                        City
                                    </label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            name="city"
                                            value={formData.city}
                                            onChange={handleInputChange}
                                            className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="text-neutral-900 py-2 border-b border-transparent">{profile.city || 'N/A'}</p>
                                    )}
                                </div>

                                {/* Status (Read-only) */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                                        Account Status
                                    </label>
                                    <p className="py-2">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${profile.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                                profile.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-red-100 text-red-800'
                                            }`}>
                                            {profile.status}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="mt-6">
                                <label className="block text-sm font-medium text-neutral-700 mb-2">
                                    Store Address
                                </label>
                                {isEditing ? (
                                    <textarea
                                        name="address"
                                        value={formData.address}
                                        onChange={handleInputChange}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                                    />
                                ) : (
                                    <p className="text-neutral-900 py-2 leading-relaxed">{profile.address || 'N/A'}</p>
                                )}
                            </div>

                            {/* Action Buttons (Edit Mode) */}
                            {isEditing && (
                                <div className="mt-8 flex items-center gap-4">
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                    >
                                        {saving ? (
                                            <div className="flex items-center gap-2">
                                                <div className="animate-spin h-4 w-4 border-2 border-white border-b-transparent rounded-full"></div>
                                                Saving...
                                            </div>
                                        ) : 'Save Changes'}
                                    </button>
                                    <button
                                        onClick={handleCancel}
                                        disabled={saving}
                                        className="px-6 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Additional Settings Sections (Placeholders) */}
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Security</h3>
                            <p className="text-sm text-neutral-600 mb-4">Update your password and manage account security.</p>
                            <button className="text-teal-600 hover:text-teal-700 text-sm font-medium transition-colors">
                                Change Password →
                            </button>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Notifications</h3>
                            <p className="text-sm text-neutral-600 mb-4">Configure how you receive alerts and updates.</p>
                            <button className="text-teal-600 hover:text-teal-700 text-sm font-medium transition-colors">
                                Manage Notifications →
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
