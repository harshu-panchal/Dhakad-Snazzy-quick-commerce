import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkWallet() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB');

        const PlatformWallet = mongoose.model('PlatformWallet');
        const wallet = await PlatformWallet.findOne();
        console.log('Platform Wallet:', JSON.stringify(wallet, null, 2));

        const Delivery = mongoose.model('Delivery');
        const dbs = await Delivery.find({ balance: { $gt: 0 } });
        console.log('Delivery Boys with balance:', dbs.length);
        dbs.forEach(db => console.log(`- ${db.name}: ₹${db.balance}`));

        const dbsDebt = await Delivery.find({ pendingAdminPayout: { $gt: 0 } });
        console.log('Delivery Boys with debt:', dbsDebt.length);
        dbsDebt.forEach(db => console.log(`- ${db.name}: ₹${db.pendingAdminPayout}`));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkWallet();
