import api from './config';

export interface WalletTransaction {
    _id: string;
    type: 'Credit' | 'Debit';
    amount: number;
    status: string;
    description: string;
    source: string;
    product?: { _id: string; productName: string; mainImage?: string } | null;
    date: string;
}

export interface WalletData {
    balance: number;
    totalEarned: number;
    transactionCount: number;
    transactions: WalletTransaction[];
}

export const getWallet = async (): Promise<{ success: boolean; data: WalletData }> => {
    const response = await api.get('/customer/wallet');
    return response.data;
};
