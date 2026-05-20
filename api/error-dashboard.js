// ===== Error Dashboard — View and manage error logs =====
// GET /api/error-dashboard — Returns HTML dashboard
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).send('Supabase not configured');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Get all errors for stats
    const { data: allErrors } = await supabase.from('error_logs').select('id,status,level,project,message,stack_trace,url,tags,occurred_at').order('occurred_at', { ascending: false }).limit(200);
    const errors = allErrors || [];

    // Compute stats from data (avoids count queries that break with anon key)
    const stats = {
      total: errors.length,
      new: errors.filter(e => e.status === 'new').length,
      resolved: errors.filter(e => e.status === 'resolved').length,
      investigating: errors.filter(e => e.status === 'investigating').length
    };

    // Server-side render function for error cards
    function renderError(e) {
      const levelColors = { error: 'bg-red-600', warning: 'bg-yellow-500', info: 'bg-blue-500' };
      const statusColors = { new: 'bg-red-500', investigating: 'bg-yellow-500', resolved: 'bg-green-500', ignored: 'bg-gray-500' };
      const lc = levelColors[e.level] || 'bg-gray-500';
      const sc = statusColors[e.status] || 'bg-gray-500';
      const msg = (e.message || '').slice(0, 300).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const st = (e.stack_trace || '').slice(0, 1000).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const url = (e.url || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const tags = e.tags || {};
      const tagHtml = Object.keys(tags).length
        ? '<div class="mt-2 flex gap-1 flex-wrap">' + Object.entries(tags).map(([k,v]) => '<span class="text-xs bg-gray-700 px-2 py-0.5 rounded">' + k + ': ' + v + '</span>').join('') + '</div>'
        : '';
      return `<div class="bg-gray-800 rounded-lg p-4 border-l-4 ${lc}">
        <div class="flex justify-between items-start mb-2">
          <div class="flex gap-2 items-center">
            <span class="${lc} px-2 py-0.5 rounded text-xs uppercase">${e.level}</span>
            <span class="${sc} px-2 py-0.5 rounded text-xs">${e.status}</span>
            <span class="text-xs text-gray-400">${e.project}</span>
          </div>
          <span class="text-xs text-gray-500">${new Date(e.occurred_at).toLocaleString()}</span>
        </div>
        <p class="font-mono text-sm mb-2">${msg}</p>
        ${url ? '<p class="text-xs text-gray-400">📍 ' + url + '</p>' : ''}
        ${st ? '<details class="mt-2"><summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Stack Trace</summary><pre class="mt-1 text-xs text-gray-400 overflow-x-auto max-h-40">' + st + '</pre></details>' : ''}
        ${tagHtml}
        <div class="mt-2 flex gap-2">
          <button onclick="updateStatus('${e.id}', 'investigating')" class="text-xs bg-yellow-600 px-2 py-1 rounded hover:bg-yellow-500">🔍 Investigate</button>
          <button onclick="updateStatus('${e.id}', 'resolved')" class="text-xs bg-green-600 px-2 py-1 rounded hover:bg-green-500">✅ Resolve</button>
          <button onclick="updateStatus('${e.id}', 'ignored')" class="text-xs bg-gray-600 px-2 py-1 rounded hover:bg-gray-500">🙈 Ignore</button>
        </div>
      </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Error Tracker Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen">
<div class="max-w-6xl mx-auto p-6">
  <div class="flex justify-between items-center mb-8">
    <h1 class="text-2xl font-bold">🔍 Error Tracker</h1>
    <div class="flex gap-2">
      <span class="px-3 py-1 bg-red-600 rounded-full text-sm">${stats.new} new</span>
      <span class="px-3 py-1 bg-yellow-600 rounded-full text-sm">${stats.investigating} investigating</span>
      <span class="px-3 py-1 bg-green-600 rounded-full text-sm">${stats.resolved} resolved</span>
      <span class="px-3 py-1 bg-gray-600 rounded-full text-sm">${stats.total} total</span>
    </div>
  </div>

  <div class="bg-gray-800 rounded-lg p-4 mb-6">
    <div class="flex gap-4 flex-wrap">
      <input id="search" type="text" placeholder="Search errors..." class="bg-gray-700 px-4 py-2 rounded flex-1 min-w-[200px]" oninput="filter()">
      <select id="levelFilter" class="bg-gray-700 px-4 py-2 rounded" onchange="filter()">
        <option value="">All Levels</option>
        <option value="error">Error</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
      <select id="statusFilter" class="bg-gray-700 px-4 py-2 rounded" onchange="filter()">
        <option value="">All Status</option>
        <option value="new">New</option>
        <option value="investigating">Investigating</option>
        <option value="resolved">Resolved</option>
      </select>
      <button onclick="refresh()" class="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500">↻ Refresh</button>
    </div>
  </div>

  <div id="errorList" class="space-y-3">
    ${errors.map(e => renderError(e)).join('\n')}
  </div>
</div>

<script>
function renderError(e) {
  const levelColors = { error: 'bg-red-600', warning: 'bg-yellow-500', info: 'bg-blue-500' };
  const statusColors = { new: 'bg-red-500', investigating: 'bg-yellow-500', resolved: 'bg-green-500', ignored: 'bg-gray-500' };
  const levelColor = levelColors[e.level] || 'bg-gray-500';
  const statusColor = statusColors[e.status] || 'bg-gray-500';
  return \`
    <div class="bg-gray-800 rounded-lg p-4 border-l-4 \${levelColor}">
      <div class="flex justify-between items-start mb-2">
        <div class="flex gap-2 items-center">
          <span class="\${levelColor} px-2 py-0.5 rounded text-xs uppercase">\${e.level}</span>
          <span class="\${statusColor} px-2 py-0.5 rounded text-xs">\${e.status}</span>
          <span class="text-xs text-gray-400">\${e.project}</span>
        </div>
        <span class="text-xs text-gray-500">\${new Date(e.occurred_at).toLocaleString()}</span>
      </div>
      <p class="font-mono text-sm mb-2">\${escapeHtml(e.message || '').slice(0, 300)}</p>
      \${e.url ? '<p class="text-xs text-gray-400">📍 ' + escapeHtml(e.url) + '</p>' : ''}
      \${e.stack_trace ? '<details class="mt-2"><summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Stack Trace</summary><pre class="mt-1 text-xs text-gray-400 overflow-x-auto max-h-40">' + escapeHtml(e.stack_trace).slice(0, 1000) + '</pre></details>' : ''}
      \${e.tags && Object.keys(e.tags).length ? '<div class="mt-2 flex gap-1 flex-wrap">' + Object.entries(e.tags).map(([k,v]) => '<span class="text-xs bg-gray-700 px-2 py-0.5 rounded">' + k + ': ' + v + '</span>').join('') + '</div>' : ''}
      <div class="mt-2 flex gap-2">
        <button onclick="updateStatus('\${e.id}', 'investigating')" class="text-xs bg-yellow-600 px-2 py-1 rounded hover:bg-yellow-500">🔍 Investigate</button>
        <button onclick="updateStatus('\${e.id}', 'resolved')" class="text-xs bg-green-600 px-2 py-1 rounded hover:bg-green-500">✅ Resolve</button>
        <button onclick="updateStatus('\${e.id}', 'ignored')" class="text-xs bg-gray-600 px-2 py-1 rounded hover:bg-gray-500">🙈 Ignore</button>
      </div>
    </div>
  \`;
}

async function updateStatus(id, status) {
  const resp = await fetch('/api/log-error', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status })
  });
  if (resp.ok) refresh();
}

async function refresh() {
  const resp = await fetch('/api/error-dashboard');
  document.open();
  document.write(await resp.text());
  document.close();
}

function filter() {
  const search = document.getElementById('search').value.toLowerCase();
  const level = document.getElementById('levelFilter').value;
  const status = document.getElementById('statusFilter').value;
  document.querySelectorAll('#errorList > div').forEach(el => {
    const text = el.textContent.toLowerCase();
    const showSearch = !search || text.includes(search);
    const showLevel = !level || text.includes(level);
    const showStatus = !status || text.includes('>' + status + '<');
    el.style.display = (showSearch && showLevel && showStatus) ? '' : 'none';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send('Error loading dashboard: ' + err.message);
  }
}
