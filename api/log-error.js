// ===== Error Logger — Internal error tracking via Supabase =====
// POST: Log a new error
// GET: Query recent errors (with filters)
// PATCH: Update error status (acknowledge/resolve/ignore)
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    switch (req.method) {
      // ===== LOG A NEW ERROR =====
      case 'POST': {
        const { project, level, message, stack_trace, context, url, user_id, tags } = req.body || {};

        if (!project) {
          return res.status(400).json({ error: 'project is required' });
        }
        if (!message) {
          return res.status(400).json({ error: 'message is required' });
        }

        const validLevels = ['error', 'warning', 'info'];
        const safeLevel = validLevels.includes(level) ? level : 'error';

        const { data, error } = await supabase.from('error_logs').insert({
          project,
          level: safeLevel,
          message,
          stack_trace: stack_trace || null,
          context: context || {},
          url: url || null,
          user_id: user_id || null,
          tags: tags || {},
          status: 'new',
          occurred_at: new Date().toISOString()
        }).select().single();

        if (error) throw error;

        // If it's an error (not warning/info), fire alert
        if (safeLevel === 'error') {
          try {
            await alertError(supabase, data);
          } catch (alertErr) {
            console.error('Alert failed (non-fatal):', alertErr.message);
          }
        }

        return res.status(201).json({ success: true, id: data.id });
      }

      // ===== QUERY ERRORS =====
      case 'GET': {
        const {
          project, level, status, limit = 50, offset = 0,
          since, until, search
        } = req.query;

        let query = supabase.from('error_logs').select('*', { count: 'exact' });

        if (project) query = query.eq('project', project);
        if (level) query = query.eq('level', level);
        if (status) query = query.eq('status', status);
        if (since) query = query.gte('occurred_at', since);
        if (until) query = query.lte('occurred_at', until);
        if (search) query = query.or(`message.ilike.%${search}%,stack_trace.ilike.%${search}%`);

        const { data, error, count } = await query
          .order('occurred_at', { ascending: false })
          .range(Number(offset), Number(offset) + Number(limit) - 1);

        if (error) throw error;

        return res.status(200).json({ errors: data, total: count });
      }

      // ===== UPDATE ERROR STATUS =====
      case 'PATCH': {
        const { id, status, notes, resolved_by } = req.body || {};

        if (!id || !status) {
          return res.status(400).json({ error: 'id and status are required' });
        }

        const updateFields = { status };

        if (status === 'resolved') {
          updateFields.resolved_at = new Date().toISOString();
          updateFields.resolved_by = resolved_by || null;
        }
        if (notes !== undefined) updateFields.notes = notes;

        const { data, error } = await supabase.from('error_logs')
          .update(updateFields)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, error: data });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Error logger handler failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ===== ALERTING — Notify Telegram + WhatsApp on critical errors =====
async function alertError(supabase, errorRecord) {
  const text = `🚨 *Error Alert* — ${errorRecord.project}\n` +
    `Level: ${errorRecord.level.toUpperCase()}\n` +
    `Message: ${errorRecord.message.slice(0, 200)}\n` +
    `URL: ${errorRecord.url || 'N/A'}\n` +
    `Time: ${errorRecord.occurred_at}\n` +
    `ID: \`${errorRecord.id}\``;

  // Send to Telegram (Alfred's DM)
  const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || '320861427';
  if (TELEGRAM_BOT) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT,
          text,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.error('Telegram alert failed:', e.message);
    }
  }
}
