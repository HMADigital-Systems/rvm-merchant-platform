import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

const API_BASE = "https://api.autogcm.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ... Headers setup ...
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );

  const { userId, phone } = req.body;

  // ... callAutoGCM helper ...
  async function callAutoGCM(endpoint: string, data: any) {
    const timestamp = Date.now().toString();
    const secret = process.env.VITE_API_SECRET!;
    const merchantNo = process.env.VITE_MERCHANT_NO!;
    const sign = crypto.createHash('md5').update(merchantNo + secret + timestamp).digest('hex');
    try {
        return await axios.post(API_BASE + endpoint, data, {
            headers: { "merchant-no": merchantNo, "timestamp": timestamp, "sign": sign }
        });
    } catch (e) { return null; }
  }

  try {
    // 1. Get Vendor Balance (The "Old App" View)
    const apiRes = await callAutoGCM('/api/open/v1/user/account/sync', { phone });
    const vendorBalance = Number(apiRes?.data?.data?.integral || 0);

    // 2. Get Local "Mirror" State
    // We calculate what the balance SHOULD be if the user ONLY recycled and never withdrew locally.
    
    // A. Total Lifetime Earnings
    const { data: reviews } = await supabase.from('submission_reviews')
        .select('calculated_value')
        .eq('user_id', userId)
        .eq('status', 'VERIFIED');
    
    const totalEarned = reviews?.reduce((sum, r) => sum + Number(r.calculated_value), 0) || 0;

    // B. Previous "External Spend" deductions we already made
    const { data: externalTxns } = await supabase.from('wallet_transactions')
        .select('amount')
        .eq('user_id', userId)
        .eq('transaction_type', 'EXTERNAL_SPEND');

    // Note: 'amount' is negative in DB, so we add it to reduce the balance
    const totalExternalSpent = externalTxns?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    // 3. The Comparison
    // "comparisonBalance" ignores Local Withdrawals. It represents the "Gross Points" available on the Old App.
    const comparisonBalance = Number((totalEarned + totalExternalSpent).toFixed(2));
    const diff = Number((vendorBalance - comparisonBalance).toFixed(2));

    // 4. Get Current Wallet (For updating actual balance if needed)
    const { data: wallet } = await supabase.from('merchant_wallets')
        .select('id, merchant_id, current_balance')
        .eq('user_id', userId)
        .order('current_balance', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!wallet && diff !== 0) {
         return res.json({ status: 'MISSING_RECORDS', msg: 'No local wallet found.' });
    }

    // 5. Logic Flow
    if (diff < -0.5) {
        // SCENARIO A: RISK DETECTED
        // Vendor (50) < Mirror (100). User spent 50 points on Old App.
        // We must DEDUCT 50 from our local wallet to match.
        
        if (!wallet) throw new Error("Wallet not found");

        const adjustment = diff; // Negative number (e.g., -50)
        const newLocalBalance = Number((wallet.current_balance + adjustment).toFixed(2));
        
        // Log the deduction
        await supabase.from('wallet_transactions').insert({
            user_id: userId,
            merchant_id: wallet.merchant_id,
            amount: adjustment, 
            balance_after: newLocalBalance,
            transaction_type: 'EXTERNAL_SPEND',
            description: `Auto-Sync: Detected ${Math.abs(adjustment)} pts spent externally`
        });

        // Update Wallet
        await supabase.from('merchant_wallets')
            .update({ current_balance: newLocalBalance })
            .eq('id', wallet.id);

        return res.json({ 
            status: 'RISK_DETECTED', 
            vendorBalance, 
            comparisonBalance, 
            newLocalBalance, // Return this so UI knows the new real balance
            msg: `⚠️ Synced: Deducted ${Math.abs(adjustment)} pts spent externally.` 
        });
    }
    else if (diff > 0.5) {
        // Vendor (150) > Mirror (100). 
        // User recycled new items we haven't synced yet.
        return res.json({ 
            status: 'MISSING_RECORDS', 
            vendorBalance, 
            comparisonBalance, 
            msg: 'Vendor has more points (Missing Logs).' 
        });
    }

    // SCENARIO B: MATCHED
    // Vendor (100) == Mirror (100).
    // Even if Local Wallet is 50 (due to pending withdrawal), this is safe.
    // It means no *Unknown* spending happened.
    return res.json({ 
        status: 'MATCHED', 
        vendorBalance, 
        comparisonBalance, 
        msg: 'Audit Passed: Balances aligned.' 
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}