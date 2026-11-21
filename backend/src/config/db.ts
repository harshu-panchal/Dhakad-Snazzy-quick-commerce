import mongoose from 'mongoose';
import dotenv from 'dotenv';
import '../models/RazorpayPaymentAttempt';
import '../models/RazorpayWebhookEvent';
import '../models/PaymentOutboxEvent';
import '../models/Notification';
import '../models/Payment';

dotenv.config();

// autoIndex is off (below) so index builds never block a request on a cold
// collection, but that also means schema-declared indexes (e.g. Seller's
// 2dsphere index, Shop's isActive+order index) are never created automatically.
// createIndexes() only *adds* whatever the schema declares - unlike
// syncIndexes(), it never drops an index it doesn't recognize, so it's safe
// to run on every boot even against a DB that already has extra indexes.
const ensureCustomerFacingIndexes = async (): Promise<void> => {
  // Role, AdminSession and AuditLog carry indexes the admin RBAC system relies
  // on: unique role names, the unique refresh-token hash, and the TTL indexes
  // that expire sessions and (optionally) audit records. With autoIndex off
  // they would otherwise never be created.
  const modelNames = [
    'Seller',
    'Shop',
    'Product',
    'Category',
    'SubCategory',
    'Commission',
    'Role',
    'AdminSession',
    'AuditLog',
    'City',
  ];
  for (const name of modelNames) {
    try {
      const model = mongoose.models[name];
      if (model) {
        await model.createIndexes();
      }
    } catch (error) {
      console.error(`   \x1b[33m!\x1b[0m Failed to ensure indexes for ${name}:`, error);
    }
  }
};

// Financial idempotency depends on these unique indexes. Unlike performance
// indexes, they must exist before the API accepts payments or webhooks.
const ensurePaymentIntegrityIndexes = async (): Promise<void> => {
  const modelNames = [
    'RazorpayPaymentAttempt',
    'RazorpayWebhookEvent',
    'PaymentOutboxEvent',
    'Notification',
    'Payment',
  ];
  for (const name of modelNames) {
    const model = mongoose.models[name];
    if (!model) throw new Error(`Payment integrity model ${name} is not registered`);
    await model.createIndexes();
  }
};

const connectDB = async (): Promise<void> => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    mongoose.set('autoIndex', false);
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n\x1b[32m✓\x1b[0m \x1b[1mMongoDB Connected Successfully\x1b[0m');
    console.log(`   \x1b[36mHost:\x1b[0m ${conn.connection.host}`);
    console.log(`   \x1b[36mDatabase:\x1b[0m ${conn.connection.name}\n`);

    await ensurePaymentIntegrityIndexes();

    // Fire-and-forget: don't block server startup on index creation.
    void ensureCustomerFacingIndexes();
  } catch (error) {
    console.error('\n\x1b[31m✗\x1b[0m \x1b[1mMongoDB Connection Error\x1b[0m');
    if (error instanceof Error) {
      console.error(`   \x1b[31m${error.message}\x1b[0m\n`);
    } else {
      console.error(`   \x1b[31m${String(error)}\x1b[0m\n`);
    }
    process.exit(1);
  }
};

export default connectDB;




