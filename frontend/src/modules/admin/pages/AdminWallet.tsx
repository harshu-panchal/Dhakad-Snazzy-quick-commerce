import React, { useState, useEffect } from "react";
import {
  getFinancialDashboard,
  getAdminEarnings,
  getWalletTransactions,
  getWithdrawalRequests,
  processWithdrawal,
  type WalletStats,
  type WalletTransaction,
  type WithdrawalRequest,
  type AdminEarning,
} from "../../../services/api/admin/adminWalletService";
import { useAuth } from "../../../context/AuthContext";

// Icons (using standard SVGs for zero dependency issues)
const StatsIcon = () => (
  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TabButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${active
        ? "border-teal-600 text-teal-700 bg-teal-50"
        : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      }`}
  >
    {label}
  </button>
);

export default function AdminWallet() {
  const { isAuthenticated, token } = useAuth();

  // State
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [activeTab, setActiveTab] = useState<"transactions" | "withdrawals" | "earnings">("transactions");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Withdrawal Action State
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch Stats on Mount
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    getFinancialDashboard().then((res) => {
      if (res.success && res.data) setStats(res.data);
    });
  }, [isAuthenticated, token]);

  // Fetch Tab Data
  const fetchData = async () => {
    setLoading(true);
    try {
      let res;
      if (activeTab === "transactions") {
        res = await getWalletTransactions({ page, limit: 10 });
      } else if (activeTab === "withdrawals") {
        res = await getWithdrawalRequests({ page, limit: 10 });
      } else if (activeTab === "earnings") {
        res = await getAdminEarnings({ page, limit: 10 });
      }

      if (res && res.success) {
        setData(res.data || []);
        const meta = (res as any).pagination;
        if (meta) {
          setTotalPages(meta.pages || 1);
        }
      } else {
        setData([]);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchData();
  }, [activeTab, page, isAuthenticated, token]);

  // Actions
  const handleWithdrawalAction = async (id: string, action: "Approve" | "Reject") => {
    if (!window.confirm(`Are you sure you want to ${action} this request?`)) return;

    setProcessingId(id);
    try {
      const remark = action === "Reject" ? prompt("Enter rejection reason:") : undefined;
      if (action === "Reject" && !remark) {
        setProcessingId(null);
        return; // Cancelled
      }

      const res = await processWithdrawal({ requestId: id, action, remark: remark || undefined });
      if (res.success) {
        alert("Processed successfully");
        fetchData(); // Refresh list
        // Refresh stats too as wallet balance changed
        getFinancialDashboard().then(r => r.success && setStats(r.data));
      } else {
        alert("Failed: " + res.message);
      }
    } catch (err: any) {
      alert("Error: " + (err.message || "Unknown error"));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 bg-gray-50 min-h-screen">
      {/* Header & Stats */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Wallet Management</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard
            title="Total Earnings"
            amount={stats?.totalEarnings || 0}
            color="bg-gradient-to-r from-teal-500 to-teal-600"
          />
          <StatsCard
            title="Paid Earnings"
            amount={stats?.paidEarnings || 0}
            color="bg-gradient-to-r from-green-500 to-green-600"
          />
          <StatsCard
            title="Pending Earnings"
            amount={stats?.pendingEarnings || 0}
            color="bg-gradient-to-r from-yellow-500 to-yellow-600"
          />
          <StatsCard
            title="This Month"
            amount={stats?.thisMonthEarnings || 0}
            color="bg-gradient-to-r from-blue-500 to-blue-600"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <TabButton
            active={activeTab === "transactions"}
            label="All Transactions"
            onClick={() => { setActiveTab("transactions"); setPage(1); }}
          />
          <TabButton
            active={activeTab === "withdrawals"}
            label="Withdrawal Requests"
            onClick={() => { setActiveTab("withdrawals"); setPage(1); }}
          />
          <TabButton
            active={activeTab === "earnings"}
            label="Admin Earnings"
            onClick={() => { setActiveTab("earnings"); setPage(1); }}
          />
        </div>

        {/* Content Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading data...</div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No records found.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                {activeTab === "transactions" && (
                  <tr>
                    <Th>ID</Th>
                    <Th>Type</Th>
                    <Th>Amount</Th>
                    <Th>Description</Th>
                    <Th>Date</Th>
                  </tr>
                )}
                {activeTab === "withdrawals" && (
                  <tr>
                    <Th>User</Th>
                    <Th>Amount</Th>
                    <Th>Method</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th>Action</Th>
                  </tr>
                )}
                {activeTab === "earnings" && (
                  <tr>
                    <Th>ID</Th>
                    <Th>Source</Th>
                    <Th>Amount</Th>
                    <Th>Status</Th>
                    <Th>Date</Th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    {activeTab === "transactions" && (
                      <>
                        {/* Use safe access for _id as it might be missing or varied */}
                        <Td>{(item as WalletTransaction)._id ? (item as WalletTransaction)._id.toString().slice(-6) : "N/A"}</Td>
                        <Td>
                          <Badge type={(item as WalletTransaction).type}>
                            {(item as WalletTransaction).type}
                          </Badge>
                        </Td>
                        <Td className="font-semibold text-gray-900">₹{(item as WalletTransaction).amount}</Td>
                        <Td>{(item as WalletTransaction).description}</Td>
                        <Td>{new Date((item as WalletTransaction).createdAt).toLocaleDateString()}</Td>
                      </>
                    )}
                    {activeTab === "withdrawals" && (
                      <>
                        <Td>
                          <div className="flex flex-col">
                            <span className="font-medium">{(item as WithdrawalRequest).userName || "Unknown"}</span>
                            <span className="text-xs text-gray-500">{(item as WithdrawalRequest).userEmail}</span>
                          </div>
                        </Td>
                        <Td className="font-bold">₹{(item as WithdrawalRequest).amount}</Td>
                        <Td>{(item as WithdrawalRequest).paymentMethod}</Td>
                        <Td>{(item as WithdrawalRequest).requestDate}</Td>
                        <Td>
                          <StatusBadge status={(item as WithdrawalRequest).status} />
                        </Td>
                        <Td>
                          {(item as WithdrawalRequest).status === "Pending" && (
                            <div className="flex space-x-2">
                              <button
                                disabled={!!processingId}
                                onClick={() => handleWithdrawalAction((item as WithdrawalRequest).id, "Approve")}
                                className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                disabled={!!processingId}
                                onClick={() => handleWithdrawalAction((item as WithdrawalRequest).id, "Reject")}
                                className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </Td>
                      </>
                    )}
                    {activeTab === "earnings" && (
                      <>
                        <Td>{(item as AdminEarning).id ? (item as AdminEarning).id.toString().slice(-6) : "N/A"}</Td>
                        <Td>{(item as AdminEarning).source}</Td>
                        <Td className="text-green-600 font-medium">₹{(item as AdminEarning).amount}</Td>
                        <Td><StatusBadge status={(item as AdminEarning).status} /></Td>
                        <Td>{(item as AdminEarning).date}</Td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Improved Pagination */}
        <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-4 py-2 border rounded-md text-sm bg-white disabled:opacity-50 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 border rounded-md text-sm bg-white disabled:opacity-50 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-components
const StatsCard = ({ title, amount, color }: { title: string, amount: number, color: string }) => (
  <div className={`${color} p-4 rounded-lg shadow-sm text-white relative overflow-hidden`}>
    <div className="flex justify-between items-start z-10 relative">
      <div>
        <p className="text-teal-100 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold mt-1">₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h3>
      </div>
      <div className="p-2 bg-white/20 rounded-full">
        <StatsIcon />
      </div>
    </div>
  </div>
);

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th>
);

const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${className || ""}`}>{children}</td>
);

const Badge = ({ type, children }: { type: string, children: React.ReactNode }) => {
  const color = type === 'Credit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {children}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  let color = 'bg-gray-100 text-gray-800';
  if (status === 'Paid' || status === 'Approved' || status === 'Completed') color = 'bg-green-100 text-green-800';
  if (status === 'Pending') color = 'bg-yellow-100 text-yellow-800';
  if (status === 'Rejected' || status === 'Failed') color = 'bg-red-100 text-red-800';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status}
    </span>
  );
};
