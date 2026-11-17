import Admin from "../models/Admin";
import NotificationTemplate from "../models/NotificationTemplate";

export async function seedProductReminderTemplates() {
  const admin = await Admin.findOne().select("_id").lean();
  if (!admin) return;
  const defaults = [
    {
      name: "Recent product interest",
      key: "recent-product-interest",
      category: "RecentProductInterest",
      titleTemplate: "Still interested in {{productName}}?",
      bodyTemplate: "{{productName}} is available from {{storeName}} for {{price}}.",
    },
    {
      name: "Back in stock",
      key: "back-in-stock",
      category: "BackInStock",
      titleTemplate: "{{productName}} is back in stock",
      bodyTemplate: "The product you explored is available again from {{storeName}} for {{price}}.",
    },
  ] as const;
  for (const template of defaults) {
    await NotificationTemplate.updateOne(
      { key: template.key, version: 1 },
      { $setOnInsert: { ...template, allowedPlaceholders: ["customerName", "productName", "storeName", "price", "mrp", "discount"], status: "Active", version: 1, createdBy: admin._id, updatedBy: admin._id } },
      { upsert: true },
    );
  }
}
