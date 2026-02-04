import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

const API_BASE = "https://api.autogcm.com";

// Helper for AutoGCM Call
async function fetchAutoGCMBalance(phone: string, merchantNo: string, secret: string) {
    const timestamp = Date.now().toString();
    const sign = crypto.createHash('md5').update(merchantNo + secret + timestamp).digest('hex');
    try {
        const res = await axios.post(API_BASE + '/api/open/v1/user/account/sync', { phone }, {
            headers: { "merchant-no": merchantNo, "timestamp": timestamp, "sign": sign },
            timeout: 5000 // 5s timeout to prevent hanging
        });
        return { phone, balance: Number(res?.data?.data?.integral || 0), error: null };
    } catch (e) { 
        return { phone, balance: 0, error: true }; 
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // ... CORS Headers ...
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Expecting an array of users: [{ userId: '...', phone: '...' }, ...]
    const { users } = req.body; 
    if (!users || !Array.isArray(users)) return res.status(400).json({ error: "Invalid payload" });

    const userIds = users.map(u => u.userId);
    const results = [];

    try {
        // 1. PARALLEL: Fetch AutoGCM Balances for all 10 users at once
        const merchantNo = process.env.VITE_MERCHANT_NO!;
        const secret = process.env.VITE_API_SECRET!;
        
        const vendorPromises = users.map(u => fetchAutoGCMBalance(u.phone, merchantNo, secret));
        const vendorResults = await Promise.all(vendorPromises);
        const vendorMap = new Map(vendorResults.map(i => [i.phone, i]));

        // 2. BULK FETCH: Get Supabase Data for all 10 users in ONE query (Much faster)
        const { data: reviews } = await supabase.from('submission_reviews')
            .select('user_id, calculated_value')
            .in('user_id', userIds)
            .eq('status', 'VERIFIED');
            
        const { data: externalTxns } = await supabase.from('wallet_transactions')
            .select('user_id, amount')
            .in('user_id', userIds)
            .eq('transaction_type', 'EXTERNAL_SPEND');

        const { data: wallets } = await supabase.from('merchant_wallets')
            .select('id, user_id, merchant_id, current_balance')
            .in('user_id', userIds);

        // 3. PROCESS EACH USER
        for (const user of users) {
            const vendorData = vendorMap.get(user.phone);
            if (vendorData?.error) continue; // Skip failed API calls

            const vendorBalance = vendorData!.balance;

            // Calculate Local Mirror Balance
            const userReviews = reviews?.filter(r => r.user_id === user.userId) || [];
            const userTxns = externalTxns?.filter(t => t.user_id === user.userId) || [];
            
            const totalEarned = userReviews.reduce((sum, r) => sum + Number(r.calculated_value), 0);
            const totalExternalSpent = userTxns.reduce((sum, t) => sum + Number(t.amount), 0);
            
            const comparisonBalance = Number((totalEarned + totalExternalSpent).toFixed(2));
            const diff = Number((vendorBalance - comparisonBalance).toFixed(2));

            // Risk Detection Logic
            if (diff < -0.5) {
                // RISK FOUND
                const wallet = wallets?.find(w => w.user_id === user.userId);
                if (wallet) {
                    const adjustment = diff; // Negative number
                    const newLocalBalance = Number((wallet.current_balance + adjustment).toFixed(2));

                    // Perform Deduction
                    await supabase.from('wallet_transactions').insert({
                        user_id: user.userId,
                        merchant_id: wallet.merchant_id,
                        amount: adjustment,
                        balance_after: newLocalBalance,
                        transaction_type: 'EXTERNAL_SPEND',
                        description: `Auto-Sync: Detected ${Math.abs(adjustment)} pts spent externally`
                    });

                    await supabase.from('merchant_wallets')
                        .update({ current_balance: newLocalBalance })
                        .eq('id', wallet.id);
                    
                    results.push({ userId: user.userId, status: 'RISK_DETECTED' });
                }
            } else if (diff > 0.5) {
                results.push({ userId: user.userId, status: 'MISSING_RECORDS' });
            } else {
                results.push({ userId: user.userId, status: 'MATCHED' });
            }
        }

        return res.json({ results });

    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}