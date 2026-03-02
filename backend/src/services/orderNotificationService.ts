import { Server as SocketIOServer } from 'socket.io';
import Delivery from '../models/Delivery';
import Order from '../models/Order';
import Seller from '../models/Seller';
import DeliveryTracking from '../models/DeliveryTracking';
import AppSettings from '../models/AppSettings';
import mongoose from 'mongoose';
import { notifySellersOfOrderUpdate } from './sellerNotificationService';
import { sendNotificationToUser } from './firebaseAdmin';
import { sendNotification } from './notificationService';

/**
 * Calculate estimated delivery boy earning for a new order
 * Uses the same logic as commission distribution but provides an estimate
 * before the order is assigned
 */
async function calculateEstimatedDeliveryBoyEarning(order: any): Promise<number> {
    try {
        // @ts-ignore - getSettings is a static method
        const settings = await AppSettings.getSettings();

        // Check if distance-based delivery is enabled
        if (
            settings?.deliveryConfig?.isDistanceBased === true &&
            settings.deliveryConfig?.deliveryBoyKmRate &&
            order.deliveryDistanceKm &&
            order.deliveryDistanceKm > 0
        ) {
            // Distance-based calculation
            const earning = order.deliveryDistanceKm * settings.deliveryConfig.deliveryBoyKmRate;
            console.log(`📊 [Earning Calc] Distance-based: ${order.deliveryDistanceKm}km × ₹${settings.deliveryConfig.deliveryBoyKmRate}/km = ₹${earning.toFixed(2)}`);
            return Math.round(earning * 100) / 100;
        }

        // Fallback to percentage-based on subtotal (default 5%)
        // Since we don't know which delivery boy will accept, use default rate
        const defaultCommissionRate = 5;
        const earning = (order.subtotal * defaultCommissionRate) / 100;
        console.log(`📊 [Earning Calc] Percentage-based: ${order.subtotal} × ${defaultCommissionRate}% = ₹${earning.toFixed(2)}`);
        return Math.round(earning * 100) / 100;
    } catch (error) {
        console.error('Error calculating estimated delivery boy earning:', error);
        // Return a safe default - 5% of subtotal
        return Math.round((order.subtotal * 5) / 100 * 100) / 100;
    }
}

// Track order notification state
export interface OrderNotificationState {
    orderId: string;
    notifiedDeliveryBoys: Set<string>;
    rejectedDeliveryBoys: Set<string>;
    acceptedBy: string | null;
}

export const notificationStates = new Map<string, OrderNotificationState>();

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Find all available delivery boys (online and active)
 */
export async function findAvailableDeliveryBoys(): Promise<mongoose.Types.ObjectId[]> {
    try {
        const deliveryBoys = await Delivery.find({
            isOnline: true,
            status: 'Active',
        }).select('_id');

        return deliveryBoys.map(db => db._id);
    } catch (error) {
        console.error('Error finding available delivery boys:', error);
        return [];
    }
}

/**
 * Find delivery boys near a specific location within a radius
 * Uses the delivery boy's location from the Delivery model (preferred)
 * or falls back to DeliveryTracking
 */
export async function findDeliveryBoysNearLocation(
    latitude: number,
    longitude: number,
    radiusKm: number = 10
): Promise<{ deliveryBoyId: mongoose.Types.ObjectId; distance: number }[]> {
    try {
        // 1. Try to find delivery boys using the new GeoJSON location field in Delivery model
        const nearbyDeliveryBoys: { deliveryBoyId: mongoose.Types.ObjectId; distance: number }[] = [];

        const deliveryBoysWithLocation = await Delivery.find({
            isOnline: true,
            status: 'Active',
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [longitude, latitude]
                    },
                    $maxDistance: radiusKm * 1000 // Convert km to meters
                }
            }
        }).select('_id location name mobile isOnline status');

        if (deliveryBoysWithLocation.length > 0) {
            console.log(`📍 [NEAR] Found ${deliveryBoysWithLocation.length} delivery boys using GeoJSON near [${longitude}, ${latitude}]:`);
            deliveryBoysWithLocation.forEach(db => {
                console.log(`   - ${db.name || 'Unknown'} (${db._id}) | Online: ${db.isOnline}, Status: ${db.status}`);
            });
            for (const db of deliveryBoysWithLocation) {
                if (db.location && db.location.coordinates) {
                    const [dbLng, dbLat] = db.location.coordinates;
                    const distance = calculateDistance(latitude, longitude, dbLat, dbLng);
                    nearbyDeliveryBoys.push({
                        deliveryBoyId: db._id as mongoose.Types.ObjectId,
                        distance
                    });
                }
            }

            console.log(`📍 Found ${nearbyDeliveryBoys.length} delivery boys using live location within ${radiusKm}km of seller`);
            return nearbyDeliveryBoys.sort((a, b) => a.distance - b.distance);
        }

        console.log(`⚠️ No delivery boys found using GeoJSON query. Attempting manual distance calculation for all online drivers...`);

        // 2. Manual fallback: Get all online delivery boys and calculate distance manually
        // This is a safety measure in case the geospatial index is missing or malformed
        const onlineDeliveryBoys = await Delivery.find({
            isOnline: true,
            status: 'Active',
            location: { $exists: true }
        }).select('_id location name');

        for (const db of onlineDeliveryBoys) {
            if (db.location && db.location.coordinates) {
                const [dbLng, dbLat] = db.location.coordinates;
                const distance = calculateDistance(latitude, longitude, dbLat, dbLng);

                if (distance <= radiusKm) {
                    console.log(`   ✅ [MANUAL] Driver ${db.name} (${db._id}) is within ${distance.toFixed(2)}km`);
                    nearbyDeliveryBoys.push({
                        deliveryBoyId: db._id as mongoose.Types.ObjectId,
                        distance
                    });
                }
            }
        }

        if (nearbyDeliveryBoys.length > 0) {
            console.log(`📍 Found ${nearbyDeliveryBoys.length} delivery boys using manual distance calculation`);
            return nearbyDeliveryBoys.sort((a, b) => a.distance - b.distance);
        }

        console.log(`⚠️ No delivery boys found within ${radiusKm}km using manual calculation. Checking tracking fallback...`);

        // 3. Fallback to the old method using DeliveryTracking
        // Get all active and online delivery boys
        const allDeliveryBoys = await Delivery.find({
            isOnline: true,
            status: 'Active',
        }).select('_id');

        if (allDeliveryBoys.length === 0) {
            return [];
        }

        // Get latest locations for these delivery boys from DeliveryTracking
        const deliveryBoyIds = allDeliveryBoys.map(db => db._id);

        // Get the most recent tracking record for each delivery boy
        const trackingRecords = await DeliveryTracking.aggregate([
            {
                $match: {
                    deliveryBoy: { $in: deliveryBoyIds },
                    // Check both legacy fields and new currentLocation structure
                    $or: [
                        { 'currentLocation.latitude': { $exists: true }, 'currentLocation.longitude': { $exists: true } },
                        { latitude: { $exists: true }, longitude: { $exists: true } }
                    ]
                }
            },
            {
                $sort: { 'currentLocation.timestamp': -1, updatedAt: -1 }
            },
            {
                $group: {
                    _id: '$deliveryBoy',
                    latestLocation: { $first: '$currentLocation' },
                    legacyLat: { $first: '$latitude' },
                    legacyLng: { $first: '$longitude' }
                }
            }
        ]);

        for (const record of trackingRecords) {
            const deliveryLat = record.latestLocation?.latitude || record.legacyLat;
            const deliveryLng = record.latestLocation?.longitude || record.legacyLng;

            if (deliveryLat && deliveryLng) {
                const distance = calculateDistance(latitude, longitude, deliveryLat, deliveryLng);

                if (distance <= radiusKm) {
                    nearbyDeliveryBoys.push({
                        deliveryBoyId: record._id,
                        distance,
                    });
                }
            }
        }

        // Also include delivery boys who don't have tracking data yet (they might be new)
        // but give them a default distance
        const trackedIds = new Set(trackingRecords.map(r => r._id.toString()));
        for (const db of allDeliveryBoys) {
            if (!trackedIds.has(db._id.toString())) {
                // Include untracked delivery boys with a default distance
                nearbyDeliveryBoys.push({
                    deliveryBoyId: db._id as mongoose.Types.ObjectId,
                    distance: radiusKm / 2, // Default to half the radius
                });
            }
        }

        // Sort by distance (nearest first)
        nearbyDeliveryBoys.sort((a, b) => a.distance - b.distance);

        console.log(`📍 Found ${nearbyDeliveryBoys.length} delivery boys (fallback) within ${radiusKm}km`);
        return nearbyDeliveryBoys;
    } catch (error) {
        console.error('Error finding nearby delivery boys:', error);
        return [];
    }
}

/**
 * Find delivery boys near seller locations for an order
 * Aggregates all unique sellers from order items and finds delivery boys within their service radius
 */
export async function findDeliveryBoysNearSellerLocations(
    order: any
): Promise<mongoose.Types.ObjectId[]> {
    try {
        console.log(`🔍 [FIND] Searching for delivery boys near sellers for order items...`);
        // Get unique seller IDs from order items
        const sellerIds = [...new Set(
            order.items
                ?.map((item: any) => {
                    const id = item.seller?._id || item.seller;
                    return id?.toString();
                })
                .filter((id: string) => id) || []
        )];

        if (sellerIds.length === 0) {
            console.log('⚠️ [FIND] No sellers found in order, falling back to all available delivery boys');
            return findAvailableDeliveryBoys();
        }

        console.log(`📍 [FIND] Found ${sellerIds.length} unique sellers in order: ${sellerIds.join(', ')}`);

        // Get seller locations
        const sellers = await Seller.find({
            _id: { $in: sellerIds },
        }).select('latitude longitude location serviceRadiusKm storeName');

        if (sellers.length === 0) {
            console.log('No seller data found, falling back to all available delivery boys');
            return findAvailableDeliveryBoys();
        }

        // Find delivery boys near each seller location
        const nearbyDeliveryBoyMap = new Map<string, { distance: number }>();

        for (const seller of sellers) {
            let lat: number | null = null;
            let lng: number | null = null;

            // Prioritize GeoJSON location field
            if (seller.location && seller.location.coordinates) {
                lng = seller.location.coordinates[0];
                lat = seller.location.coordinates[1];
            } else {
                // Fallback to legacy fields
                lat = seller.latitude ? parseFloat(seller.latitude) : null;
                lng = seller.longitude ? parseFloat(seller.longitude) : null;
            }

            if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                console.log(`Seller ${seller.storeName} has no valid location, skipping`);
                continue;
            }

            const radius = seller.serviceRadiusKm || 10; // Default 10km
            const nearbyBoys = await findDeliveryBoysNearLocation(lat, lng, radius);

            for (const boy of nearbyBoys) {
                const boyId = boy.deliveryBoyId.toString();
                // Keep the smallest distance if same delivery boy is near multiple sellers
                if (!nearbyDeliveryBoyMap.has(boyId) || nearbyDeliveryBoyMap.get(boyId)!.distance > boy.distance) {
                    nearbyDeliveryBoyMap.set(boyId, { distance: boy.distance });
                }
            }
        }

        if (nearbyDeliveryBoyMap.size === 0) {
            console.log('No delivery boys found near seller locations, falling back to all available');
            return findAvailableDeliveryBoys();
        }

        // Sort by distance and return IDs
        const sortedBoys = Array.from(nearbyDeliveryBoyMap.entries())
            .sort((a, b) => a[1].distance - b[1].distance)
            .map(([id]) => new mongoose.Types.ObjectId(id));

        console.log(`📍 Found ${sortedBoys.length} delivery boys near seller locations`);
        return sortedBoys;
    } catch (error) {
        console.error('Error finding delivery boys near seller locations:', error);
        return findAvailableDeliveryBoys();
    }
}

/**
 * Emit new order notification to delivery boys near seller locations
 * Prioritizes delivery boys within the seller's service radius
 */
export async function notifyDeliveryBoysOfNewOrder(
    io: SocketIOServer,
    order: any
): Promise<void> {
    try {
        console.log(`\n🚀 [NOTIFICATION] Starting broadcast for Order: ${order.orderNumber} (ID: ${order._id})`);
        console.log(`📍 [NOTIFICATION] Delivery Option: ${order.deliveryOption}`);

        let nearbyDeliveryBoyIds: mongoose.Types.ObjectId[] = [];

        // STRATEGY: For "Instant" orders, we want to maximize acceptance speed.
        // The user requested: "sare avaliable delivery boy ko notification jana chahiye" (All available delivery boys should get notification)
        if (order.deliveryOption === 'Instant') {
            console.log('⚡ [INSTANT] Order detected. Broadcasting to ALL ONLINE & ACTIVE delivery boys immediately.');
            nearbyDeliveryBoyIds = await findAvailableDeliveryBoys();
        } else {
            // For Standard/other orders, stick to radius logic
            nearbyDeliveryBoyIds = await findDeliveryBoysNearSellerLocations(order);

            // Fallback for Standard orders if nobody nearby
            if (nearbyDeliveryBoyIds.length === 0) {
                console.log('⚠️ [NOTIFICATION] No nearby delivery boys found. Falling back to ALL ONLINE drivers.');
                nearbyDeliveryBoyIds = await findAvailableDeliveryBoys();
            }
        }

        if (nearbyDeliveryBoyIds.length === 0) {
            console.log('⚠️ [NOTIFICATION] No available delivery boys found to notify.');
            return;
        }

        // Fetch names for logging clarity
        const potentialBoys = await Delivery.find({ _id: { $in: nearbyDeliveryBoyIds } }).select('name _id');
        console.log(`📍 [NOTIFICATION] Target drivers (${nearbyDeliveryBoyIds.length}):`);
        potentialBoys.forEach(pb => console.log(`   - ${pb.name} (${pb._id})`));

        // --- FILTER BUSY DELIVERY BOYS ---
        // For Instant orders, we might want to skip this check if urgency > capacity, 
        // but generally we shouldn't spam busy drivers unless configured otherwise.
        // Leaving filter intact for now to prevent over-assignment.
        const activeOrders = await Order.find({
            deliveryBoy: { $in: nearbyDeliveryBoyIds },
            deliveryBoyStatus: { $in: ['Assigned', 'Picked Up', 'In Transit'] },
            status: { $nin: ['Delivered', 'Cancelled', 'Rejected', 'Returned'] }
        }).select('deliveryBoy orderNumber');

        if (activeOrders.length > 0) {
            const busyIdsSet = new Set(activeOrders.map(o => o.deliveryBoy?.toString()).filter(Boolean));
            console.log(`ℹ️ [NOTIFICATION] Busy drivers detected (will be skipped):`);
            activeOrders.forEach(o => {
                if (o.deliveryBoy) {
                    console.log(`   - Driver ${o.deliveryBoy} is busy with Order ${o.orderNumber}`);
                }
            });

            nearbyDeliveryBoyIds = nearbyDeliveryBoyIds.filter(id => !busyIdsSet.has(id.toString()));
            console.log(`ℹ️ [NOTIFICATION] Drivers remaining after "Busy" filter: ${nearbyDeliveryBoyIds.length}`);

            if (nearbyDeliveryBoyIds.length === 0) {
                console.log('⚠️ [NOTIFICATION] All targeted delivery boys are currently busy.');
                return;
            }
        }

        // Calculate estimated delivery boy earning for this order
        const deliveryBoyEarning = await calculateEstimatedDeliveryBoyEarning(order);
        console.log(`💰 [NOTIFICATION] Estimated Delivery Boy Earning: ₹${deliveryBoyEarning}`);

        // Prepare order data for notification
        const orderData = {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            deliveryAddress: {
                address: order.deliveryAddress.address,
                city: order.deliveryAddress.city,
                state: order.deliveryAddress.state,
                pincode: order.deliveryAddress.pincode,
            },
            total: order.total,
            subtotal: order.subtotal,
            shipping: order.shipping,
            deliveryBoyEarning: deliveryBoyEarning,
            createdAt: order.createdAt,
            type: order.deliveryOption // passed to FE to show "Instant" tag
        };

        const orderId = order._id.toString();
        const notifiedIds = new Set<string>();

        // Notify ALL targeted delivery boys
        for (const id of nearbyDeliveryBoyIds) {
            const idString = id.toString().trim();
            notifiedIds.add(idString);

            // 1. Socket emit (Room: delivery-{id})
            const roomName = `delivery-${idString}`;
            io.to(roomName).emit('new-order', orderData);
            console.log(`📤 [Socket] Emitted 'new-order' to ${idString}`);

            // 2. Database Notification (Persist it)
            // We use Fire-and-Forget for speed here, or await if reliability is critical. 
            // Await ensures we don't overwhelm DB connection if thousands of drivers.
            await sendNotification(
                'Delivery',
                idString,
                'New Order Request',
                `New ${order.deliveryOption} Order #${order.orderNumber} is available. Earning: ₹${deliveryBoyEarning}`,
                {
                    type: 'Order',
                    link: `/delivery/orders/${order._id}`,
                    priority: 'High'
                }
            ).catch(err => console.error(`❌ [DB Notif Error] ${idString}:`, err.message));

            // 3. FCM push (so alert shows/rings when app is closed or in background)
            sendNotificationToUser(idString, 'Delivery', {
                title: 'New Order Request',
                body: `New ${order.deliveryOption} Order #${order.orderNumber} is available. Earning: ₹${deliveryBoyEarning}`,
                data: {
                    orderId: order._id.toString(),
                    type: 'NEW_ORDER_REQUEST',
                    link: `/delivery/orders/${order._id}`,
                },
                icon: 'notification_icon',
            }).catch(err => console.error(`❌ [FCM Error] ${idString}:`, err?.message));
        }

        // Also emit to the global 'delivery-notifications' room as a backup/monitor
        // io.to('delivery-notifications').emit('new-order-monitor', orderData);

        if (notifiedIds.size > 0) {
            notificationStates.set(orderId, {
                orderId,
                notifiedDeliveryBoys: notifiedIds,
                rejectedDeliveryBoys: new Set(),
                acceptedBy: null,
            });
            console.log(`\n📢 [SUCCESS] Broadcast complete. Notified ${notifiedIds.size} delivery boys.\n`);
        }
    } catch (error) {
        console.error('❌ [NOTIFICATION ERROR] Error in broadcast:', error);
    }
}


/**
 * Handle order acceptance by a delivery boy
 * Implements "First-Come-First-Serve" logic atomically.
 */
export async function handleOrderAcceptance(
    io: SocketIOServer,
    orderId: string,
    deliveryBoyId: string
): Promise<{ success: boolean; message: string }> {
    try {
        const normalizedDeliveryBoyId = String(deliveryBoyId).trim();
        console.log(`👉 [ACCEPT REQUEST] Driver ${normalizedDeliveryBoyId} attempting to accept Order ${orderId}`);

        // 1. ATOMIC ASSIGNMENT: Try to find AND update the order in one go.
        // We look for an order that matches ID AND (has no deliveryBoy OR deliveryBoy satisfies idempotency)
        // Actually, for true atomic "first one wins", we condition on deliveryBoy being null/undefined.

        // Handling Idempotency first (Optimization):
        // Check if this driver ALREADY has it. This requires a read, but it's safe.
        const existingOrder = await Order.findById(orderId).select('deliveryBoy status');
        if (existingOrder && existingOrder.deliveryBoy && existingOrder.deliveryBoy.toString() === normalizedDeliveryBoyId) {
            console.log(`✅ [ACCEPT] Idempotent success. Order already assigned to this driver.`);
            if (existingOrder.status !== 'Processed') {
                existingOrder.status = 'Processed';
                await existingOrder.save();
            }
            return { success: true, message: 'Order accepted successfully' };
        }

        // The Race Condition Fix:
        // Update ONLY if `deliveryBoy` is currently null/undefined.
        const updatedOrder = await Order.findOneAndUpdate(
            {
                _id: orderId,
                deliveryBoy: { $exists: false } // Check strictly for unassigned 
                // Or: deliveryBoy: null 
            },
            {
                $set: {
                    deliveryBoy: new mongoose.Types.ObjectId(normalizedDeliveryBoyId),
                    deliveryBoyStatus: 'Assigned',
                    assignedAt: new Date(),
                    status: 'Processed'
                }
            },
            { new: true } // Return the updated document
        );

        if (!updatedOrder) {
            // If update returned null, it means either:
            // a) Order doesn't exist
            // b) Order ALREADY has a deliveryBoy (the filter failed)

            // Re-fetch to see which case it is
            const checkOrder = await Order.findById(orderId);
            if (!checkOrder) {
                return { success: false, message: 'Order not found' };
            }
            if (checkOrder.deliveryBoy) {
                console.log(`⛔ [ACCEPT FAIL] Race condition lost. Order already taken by ${checkOrder.deliveryBoy}`);
                return { success: false, message: 'Order already accepted by another delivery partner' };
            }
            return { success: false, message: 'Failed to assign order due to unknown error' };
        }

        // 2. SUCCESS PATH
        console.log(`🏆 [ACCEPT WINNER] Order ${orderId} successfully assigned to ${normalizedDeliveryBoyId}`);

        // 3. BROADCAST "TAKEN" STATUS
        // Tell everyone (including the winner) that the order is taken.
        // The frontend for the winner should handle the success response to navigate.
        // The frontend for OTHERS should remove the popup.

        io.to('delivery-notifications').emit('order-accepted', {
            orderId,
            acceptedBy: normalizedDeliveryBoyId,
        });

        // Also emit to specific driver rooms if they aren't listening to global (redundancy)
        const state = notificationStates.get(orderId);
        if (state) {
            state.acceptedBy = normalizedDeliveryBoyId;
            // Clean up memory state
            notificationStates.delete(orderId);
        }

        // Notify Customer
        io.to(`order-${orderId}`).emit('delivery-boy-accepted', {
            orderId,
            deliveryBoyId: normalizedDeliveryBoyId,
            message: 'Your order has been accepted by a delivery partner!',
        });

        return { success: true, message: 'Order accepted successfully' };

    } catch (error) {
        console.error('Error handling order acceptance:', error);
        return { success: false, message: 'Error accepting order' };
    }
}

/**
 * Handle order rejection by a delivery boy
 */
export async function handleOrderRejection(
    io: SocketIOServer,
    orderId: string,
    deliveryBoyId: string
): Promise<{ success: boolean; message: string; allRejected: boolean }> {
    try {
        const state = notificationStates.get(orderId);

        if (!state) {
            return { success: false, message: 'Order notification not found', allRejected: false };
        }

        // Check if already accepted
        if (state.acceptedBy) {
            return { success: false, message: 'Order already accepted', allRejected: false };
        }

        // Check if this delivery boy was notified
        const normalizedDeliveryBoyId = String(deliveryBoyId).trim();
        if (!state.notifiedDeliveryBoys.has(normalizedDeliveryBoyId)) {
            console.warn(`⚠️ Delivery boy ${normalizedDeliveryBoyId} not in notified list for order ${orderId}. Notified:`, Array.from(state.notifiedDeliveryBoys));
            return { success: false, message: 'You were not notified about this order', allRejected: false };
        }

        // Check if already rejected
        if (state.rejectedDeliveryBoys.has(normalizedDeliveryBoyId)) {
            return { success: true, message: 'You have already rejected this order', allRejected: false };
        }

        // Mark as rejected
        state.rejectedDeliveryBoys.add(normalizedDeliveryBoyId);

        // Check if all delivery boys have rejected
        const allRejected = state.rejectedDeliveryBoys.size === state.notifiedDeliveryBoys.size;

        if (allRejected) {
            // Emit order-rejected-by-all event
            io.to('delivery-notifications').emit('order-rejected-by-all', {
                orderId,
            });

            try {
                // Update order in database to "Rejected"
                const order = await Order.findById(orderId);
                if (order) {
                    order.status = 'Rejected';
                    order.deliveryBoyStatus = 'Failed';
                    order.adminNotes = (order.adminNotes ? order.adminNotes + '\n' : '') +
                        `[${new Date().toISOString()}] Rejected: All notified delivery boys (${state.notifiedDeliveryBoys.size}) rejected the order.`;
                    await order.save();

                    // Notify customer via socket
                    io.to(`order-${orderId}`).emit('order-rejected', {
                        orderId,
                        message: 'Unfortunately, no delivery partner is available at the moment. Your order has been rejected.',
                    });

                    // Notify sellers/restaurants
                    notifySellersOfOrderUpdate(io, order, 'STATUS_UPDATE');

                    console.log(`✅ All delivery boys rejected order ${orderId}. Order status updated to Rejected.`);
                } else {
                    console.error(`❌ Order ${orderId} not found when trying to update rejection status`);
                }
            } catch (dbError) {
                console.error(`❌ Error updating order ${orderId} to Rejected status:`, dbError);
                // We still proceed with cleanup to avoid memory leaks/stuck state
            }

            // Clean up notification state
            notificationStates.delete(orderId);
        } else {
            // Emit rejection acknowledgment to the specific delivery boy
            io.to(`delivery-${deliveryBoyId}`).emit('order-rejection-acknowledged', {
                orderId,
            });
        }

        console.log(`🚫 Delivery boy ${deliveryBoyId} rejected order ${orderId}`);
        return { success: true, message: 'Order rejected', allRejected };
    } catch (error) {
        console.error('Error handling order rejection:', error);
        return { success: false, message: 'Error rejecting order', allRejected: false };
    }
}

/**
 * Get notification state for an order
 */
export function getNotificationState(orderId: string): OrderNotificationState | undefined {
    return notificationStates.get(orderId);
}

/**
 * Clean up notification state (for testing or manual cleanup)
 */
export function clearNotificationState(orderId: string): void {
    notificationStates.delete(orderId);
}

/**
 * Notify a specific delivery boy of an order assignment (Manual Assignment)
 */
export async function notifyDeliveryBoyOfAssignment(
    io: SocketIOServer,
    order: any,
    deliveryBoyId: string
): Promise<void> {
    try {
        // Calculate estimated delivery boy earning for this order
        const deliveryBoyEarning = await calculateEstimatedDeliveryBoyEarning(order);

        // Prepare order data for notification
        const orderData = {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            deliveryAddress: {
                address: order.deliveryAddress.address,
                city: order.deliveryAddress.city,
                state: order.deliveryAddress.state,
                pincode: order.deliveryAddress.pincode,
            },
            total: order.total,
            subtotal: order.subtotal,
            shipping: order.shipping,
            deliveryBoyEarning: deliveryBoyEarning,
            createdAt: order.createdAt,
            isManualAssignment: true // Flag to distinguish from broadcast
        };

        const deliveryBoyIdString = String(deliveryBoyId).trim();
        const roomName = `delivery-${deliveryBoyIdString}`;

        // 1. Emit Socket notification (Real-time)
        io.to(roomName).emit('new-order', orderData);
        console.log(`📤 Emitted manual assignment (new-order) to delivery boy: ${deliveryBoyIdString}`);

        // 2. Send Push Notification (FCM)
        await sendNotificationToUser(deliveryBoyIdString, 'Delivery', {
            title: 'New Order Assigned',
            body: `Order #${order.orderNumber} has been assigned to you.`,
            data: {
                orderId: order._id.toString(),
                type: 'ORDER_ASSIGNMENT'
            },
            icon: 'notification_icon' // Use a default icon resource name
        });

        // 3. Create Database Notification
        await sendNotification(
            'Delivery',
            deliveryBoyIdString,
            'New Order Assigned',
            `You have been assigned to deliver order #${order.orderNumber}.`,
            {
                type: 'Order',
                link: `/delivery/orders/${order._id}`,
                priority: 'High'
            }
        );

        // Initializing notification state for potential fallback handling
        notificationStates.set(order._id.toString(), {
            orderId: order._id.toString(),
            notifiedDeliveryBoys: new Set([deliveryBoyIdString]),
            rejectedDeliveryBoys: new Set(),
            acceptedBy: null,
        });

    } catch (error) {
        console.error('Error notifying delivery boy of assignment:', error);
    }
}