import { FormEvent, useEffect, useState } from "react";
import { AdminNotificationTemplate, createNotificationTemplate, getNotificationTemplates, updateNotificationTemplateStatus } from "../../../services/api/admin/adminNotificationTemplateService";

const initial = { name: "", key: "", category: "RecentProductInterest" as const, titleTemplate: "Still interested in {{productName}}?", bodyTemplate: "{{productName}} is available from {{storeName}} for {{price}}.", status: "Draft" as const };

export default function AdminNotificationTemplates() {
  const [templates, setTemplates] = useState<AdminNotificationTemplate[]>([]);
  const [form, setForm] = useState<any>(initial);
  const [message, setMessage] = useState("");
  const load = async () => { try { setTemplates(await getNotificationTemplates()); } catch { setMessage("Could not load templates"); } };
  useEffect(() => { void load(); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { await createNotificationTemplate(form); setForm(initial); setMessage("Template created"); await load(); }
    catch (error: any) { setMessage(error.response?.data?.message || "Could not create template"); }
  };
  return <div className="space-y-5"><div><h1 className="text-xl font-bold">Product reminder templates</h1><p className="text-sm text-neutral-500">Allowed placeholders: customerName, productName, storeName, price, mrp and discount.</p></div>
    {message && <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm">{message}</div>}
    <form onSubmit={submit} className="bg-white border rounded-xl p-4 grid md:grid-cols-2 gap-3">
      <input required placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded-lg px-3 py-2" />
      <input required placeholder="Unique key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className="border rounded-lg px-3 py-2" />
      <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-3 py-2"><option value="RecentProductInterest">Recent product interest</option><option value="BackInStock">Back in stock</option></select>
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="border rounded-lg px-3 py-2"><option value="Draft">Draft</option><option value="Active">Active</option></select>
      <input required maxLength={80} placeholder="Notification title" value={form.titleTemplate} onChange={(e) => setForm({ ...form, titleTemplate: e.target.value })} className="md:col-span-2 border rounded-lg px-3 py-2" />
      <textarea required maxLength={240} placeholder="Notification message" value={form.bodyTemplate} onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })} className="md:col-span-2 border rounded-lg px-3 py-2 min-h-24" />
      <button className="w-fit bg-teal-600 text-white rounded-lg px-4 py-2 font-semibold">Create template</button>
    </form>
    <div className="bg-white border rounded-xl overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-neutral-50 text-left"><tr><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3">Version</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{templates.map((template) => <tr key={template._id} className="border-t"><td className="p-3"><div className="font-medium">{template.name}</div><div className="text-xs text-neutral-500">{template.titleTemplate}</div></td><td className="p-3">{template.category}</td><td className="p-3">v{template.version}</td><td className="p-3">{template.status}</td><td className="p-3 space-x-2"><button onClick={() => void updateNotificationTemplateStatus(template._id, "Active").then(load)} className="text-teal-700 font-semibold">Activate</button><button onClick={() => void updateNotificationTemplateStatus(template._id, "Archived").then(load)} className="text-red-600 font-semibold">Archive</button></td></tr>)}</tbody></table></div>
  </div>;
}
