import { useCallback, useEffect, useState } from "react";
import {
  cancelReminderCampaign, createReminderCampaign, CustomerInsight, CustomerInsightSummary, getCustomerInsights,
  getCustomerInsightSummary, getInsightProducts, getReminderCampaigns, getReminderTemplates, ReminderTemplate,
} from "../../../services/api/customerInsightService";

const newKey = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const formatDate = (value?: string) => value ? new Date(value).toLocaleString("en-IN") : "Never";

export default function SellerCustomerInsights() {
  const [summary, setSummary] = useState<CustomerInsightSummary | null>(null);
  const [insights, setInsights] = useState<CustomerInsight[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [productId, setProductId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, insightResponse, productData, templateData, campaignData] = await Promise.all([
        getCustomerInsightSummary(), getCustomerInsights({ ...(productId ? { productId } : {}), page, limit: 20 }),
        getInsightProducts(), getReminderTemplates(), getReminderCampaigns(),
      ]);
      setSummary(summaryData); setInsights(insightResponse.data); setPages(insightResponse.pagination?.pages || 1); setProducts(productData); setTemplates(templateData); setCampaigns(campaignData);
      if (!templateId && templateData.length) setTemplateId(templateData.find((item) => item.category === "RecentProductInterest")?._id || "");
    } catch (error: any) { setMessage(error.response?.data?.message || "Could not load customer insights"); }
    finally { setLoading(false); }
  }, [productId, templateId, page]);

  useEffect(() => { void load(); }, [productId, page]);

  const send = async (targetProductId: string, interestId?: string) => {
    if (!templateId) return setMessage("Select an active reminder template");
    try {
      setMessage("Queueing reminder...");
      await createReminderCampaign({ productId: targetProductId, templateId, interestId, campaignType: interestId ? "ManualSingle" : "ManualBulk", idempotencyKey: newKey() });
      setMessage("Reminder campaign queued");
      await load();
    } catch (error: any) { setMessage(error.response?.data?.message || "Could not queue reminder"); }
  };

  const cards = summary ? [
    ["Detail page opens", summary.totalViews], ["Unique customers", summary.uniqueCustomers],
    ["Products explored", summary.viewedProducts], ["Repeat explorers", summary.repeatExplorers],
    ["FCM accepted", summary.notificationsAccepted], ["Reminder opens", summary.notificationOpens],
  ] : [];

  return <div className="space-y-5">
    <div><h1 className="text-xl font-bold text-neutral-900">Customer product insights</h1><p className="text-sm text-neutral-500">Logged-in customers who opened your product pages during the last 7 days.</p></div>
    {message && <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">{message}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{cards.map(([label, value]) => <div key={String(label)} className="bg-white border rounded-xl p-4"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-neutral-500 mt-1">{label}</div></div>)}</div>
    <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 items-end">
      <label className="text-xs font-semibold">Product<select value={productId} onChange={(e) => { setProductId(e.target.value); setPage(1); }} className="block mt-1 border rounded-lg px-3 py-2 min-w-52"><option value="">All products</option>{products.map((p) => <option key={p._id} value={p._id}>{p.productName}</option>)}</select></label>
      <label className="text-xs font-semibold">Approved template<select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="block mt-1 border rounded-lg px-3 py-2 min-w-64"><option value="">Select template</option>{templates.filter((t) => t.category === "RecentProductInterest").map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></label>
      <button disabled={!productId || !templateId} onClick={() => void send(productId)} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Notify all eligible viewers</button>
    </div>
    <div className="bg-white border rounded-xl overflow-x-auto">
      {loading ? <div className="p-10 text-center text-neutral-500">Loading...</div> : <table className="min-w-full text-sm"><thead className="bg-neutral-50 text-left text-xs text-neutral-500"><tr><th className="p-3">Product</th><th className="p-3">Customer</th><th className="p-3">Views</th><th className="p-3">Last viewed</th><th className="p-3">Last reminder</th><th className="p-3">Action</th></tr></thead><tbody>{insights.map((item) => <tr key={item._id} className="border-t"><td className="p-3"><div className="font-medium">{item.product?.productName || "Removed product"}</div><div className="text-xs text-neutral-500">{item.product?.stock > 0 ? "In stock" : "Out of stock"}</div></td><td className="p-3"><div>{item.customer?.name}</div><div className="text-xs text-neutral-500">{item.customer?.maskedId}</div></td><td className="p-3">{item.viewCount}</td><td className="p-3 text-xs">{formatDate(item.lastViewedAt)}</td><td className="p-3 text-xs">{formatDate(item.lastNotificationAt)}</td><td className="p-3"><button disabled={!item.marketingEnabled || !item.product?._id || !templateId} onClick={() => void send(item.product._id, item._id)} className="text-teal-700 font-semibold disabled:text-neutral-400">Send reminder</button></td></tr>)}</tbody></table>}
      {!loading && !insights.length && <div className="p-10 text-center text-neutral-500">No recent product exploration found.</div>}
    </div>
    {pages > 1 && <div className="flex justify-end gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="border rounded px-3 py-1 disabled:opacity-40">Previous</button><span className="text-sm py-1">Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="border rounded px-3 py-1 disabled:opacity-40">Next</button></div>}
    <div className="bg-white border rounded-xl p-4"><h2 className="font-semibold mb-3">Recent campaigns</h2><div className="space-y-2">{campaigns.slice(0, 10).map((campaign) => <div key={campaign._id} className="flex flex-wrap justify-between gap-2 border-b pb-2 text-xs"><span>{campaign.product?.productName} · {campaign.campaignType}</span><span>{campaign.status} · {campaign.processedCount}/{campaign.totalCandidates} processed · {campaign.acceptedCount} FCM accepted {(["Queued", "Processing"].includes(campaign.status)) && <button onClick={() => void cancelReminderCampaign(campaign._id).then(load)} className="ml-2 text-red-600 font-semibold">Cancel</button>}</span></div>)}{!campaigns.length && <p className="text-sm text-neutral-500">No campaigns yet.</p>}</div></div>
  </div>;
}
