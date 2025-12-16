import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Configuration (Allows your frontend to talk to this backend)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle Preflight Options
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Get Environment Variables
  const SECRET = process.env.VITE_API_SECRET;
  const MERCHANT_NO = process.env.VITE_MERCHANT_NO;
  const API_BASE = "https://api.autogcm.com"; 

  if (!SECRET || !MERCHANT_NO) {
    return res.status(500).json({ error: "Server Misconfiguration: Missing Secrets" });
  }

  // 3. Parse Data
  // Vercel parses the body automatically for you
  const { endpoint, method = 'GET', params = {}, body = {} } = req.body || {};

  // 4. Generate Signature
  // IMPORTANT: Use Seconds, not Milliseconds
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Sign = MD5(merchant_no + secret + timestamp)
  const rawString = `${MERCHANT_NO}${SECRET}${timestamp}`;
  const sign = crypto.createHash('md5').update(rawString).digest('hex');

  try {
    console.log(`[Proxy] Requesting: ${API_BASE}${endpoint}`);

    const response = await axios({
      url: `${API_BASE}${endpoint}`,
      method: method,
      headers: { 
        "Merchant-No": MERCHANT_NO, 
        "Timestamp": timestamp, 
        "Sign": sign, 
        "Content-Type": "application/json" 
      },
      params: params, // Query params (for GET)
      data: body      // Body data (for POST)
    });

    res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[Proxy Error]', error.message);
    // Return detailed error from the vendor if available
    res.status(500).json({ 
      error: error.message, 
      details: error.response?.data || "No details from vendor" 
    });
  }
}