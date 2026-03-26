const mongoose = require('mongoose');
const Category = require('./backend/src/models/Category').default;
const HeaderCategory = require('./backend/src/models/HeaderCategory').default;
const dotenv = require('dotenv');

dotenv.config({ path: './backend/.env' });

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const headers = await HeaderCategory.find({});
    console.log(`Found ${headers.length} header categories`);

    const categories = await Category.find({ status: 'Active' });
    console.log(`Found ${categories.length} active categories`);

    const missingHeader = categories.filter(c => !c.headerCategoryId);
    const withHeader = categories.filter(c => c.headerCategoryId);

    console.log(`Categories with headerCategoryId: ${withHeader.length}`);
    console.log(`Categories missing headerCategoryId: ${missingHeader.length}`);

    if (withHeader.length > 0) {
      console.log('Sample category with header:', {
        name: withHeader[0].name,
        headerCategoryId: withHeader[0].headerCategoryId
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkData();
