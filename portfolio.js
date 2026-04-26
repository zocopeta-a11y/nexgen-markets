/* ================================================================
   portfolio.js — real portfolio manager
   Runs AFTER app.js; uses manualHoldings, marketData, addHolding,
   formatPrice, formatLargeNumber, animateValue from app.js.
   ================================================================ */

'use strict';

// ── Broker / Provider Catalog ────────────────────────────────
const PROVIDERS = [
    {
        id: 'binance',
        name: 'Binance',
        subtitle: 'Live API Sync',
        logo: `<i class="ph ph-currency-btc" style="color:#F0B90B;font-size:38px;"></i>`,
        badge: 'LIVE API',
        badgeClass: 'live',
        method: 'api',
        description: 'Sync real-time balances directly via a read-only API key.',
        steps: [
            'Log in to <strong>Binance.com</strong>',
            'Go to <strong>Profile &rarr; API Management</strong>',
            'Click <strong>Create API</strong>, choose System Generated',
            'Enable <strong>Read Info</strong> only &mdash; <em>never</em> enable trading or withdrawals',
            'Copy the API Key and Secret below'
        ],
        note: 'Your keys are only used to call Binance from this machine. They are never stored in the cloud or sent anywhere else.',
    },
    {
        id: 'indexa',
        name: 'Indexa Capital',
        subtitle: 'CSV Import',
        logo: `<span style="color:#10b981;font-weight:900;font-size:24px;letter-spacing:-1px;">IC</span>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import your Indexa Capital portfolio from their CSV export.',
        steps: [
            'Log in to <strong>app.indexacapital.com</strong>',
            'Go to <strong>Mi Cartera &rarr; Movimientos</strong>',
            'Click the download icon &rarr; <strong>Descargar en CSV</strong>',
            'Upload the downloaded file below'
        ],
        note: 'Indexa Capital uses semicolons and European decimal format. Common ISINs (VWCE, IWDA, CSPX&hellip;) are mapped to tickers automatically.',
        broker: 'indexa',
    },
    {
        id: 'degiro',
        name: 'Degiro',
        subtitle: 'CSV Import',
        logo: `<span style="color:#FF6200;font-weight:900;font-size:30px;">D</span>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import trades from your Degiro account activity export.',
        steps: [
            'Log in to <strong>app.degiro.com</strong>',
            'Go to <strong>Activity &rarr; Transactions</strong>',
            'Set date range to <strong>All Time</strong>',
            'Click <strong>Export &rarr; CSV</strong>',
            'Upload the file below'
        ],
        note: 'Detects columns: Date/Fecha, Product, ISIN, Quantity/N&uacute;mero, Price. ISINs are mapped automatically.',
        broker: 'degiro',
    },
    {
        id: 'coinbase',
        name: 'Coinbase',
        subtitle: 'CSV Import',
        logo: `<i class="ph ph-hexagon" style="color:#0052FF;font-size:38px;"></i>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import your Coinbase transaction history.',
        steps: [
            'Log in to <strong>Coinbase.com</strong>',
            'Go to <strong>Profile &rarr; Statements</strong>',
            'Click <strong>Generate Report &rarr; Transaction History</strong>',
            'Set date range and download the CSV',
            'Upload the file below'
        ],
        note: 'Detects columns: Timestamp, Transaction Type, Asset, Quantity Transacted, Price At Transaction. Only Buy transactions are imported.',
        broker: 'coinbase',
    },
    {
        id: 'binance_csv',
        name: 'Binance CSV',
        subtitle: 'CSV Import',
        logo: `<i class="ph ph-currency-btc" style="color:#F0B90B;font-size:38px;opacity:0.7;"></i>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import from Binance transaction history CSV (no API key needed).',
        steps: [
            'Log in to <strong>Binance.com</strong>',
            'Go to <strong>Orders &rarr; Trade History</strong>',
            'Click <strong>Export</strong> and choose your date range',
            'Download the CSV file',
            'Upload the file below'
        ],
        note: 'Detects columns: Date(UTC), Pair, Side, Price, Executed, Amount. Only BUY trades are imported.',
        broker: 'binance_csv',
    },
    {
        id: 'etoro',
        name: 'eToro',
        subtitle: 'CSV Import',
        logo: `<span style="color:#00C853;font-weight:900;font-size:22px;">eT</span>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import your eToro account statement.',
        steps: [
            'Log in to <strong>eToro.com</strong>',
            'Go to <strong>Portfolio &rarr; History</strong>',
            'Click <strong>Actions &rarr; Account Statement</strong>',
            'Set date range and click <strong>Create</strong>',
            'Download the XLSX or CSV from your email / downloads',
            'Upload the file below'
        ],
        note: 'Detects columns: Date, Type, Details, Amount, Units. Only Open Position rows are imported.',
        broker: 'etoro',
    },
    {
        id: 'revolut',
        name: 'Revolut',
        subtitle: 'CSV Import',
        logo: `<span style="color:#fff;font-weight:900;font-size:20px;background:#191C1F;padding:4px 8px;border-radius:6px;">R</span>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import Revolut stocks or crypto statement.',
        steps: [
            'Open <strong>Revolut app</strong> or web',
            'Go to <strong>Wealth &rarr; Stocks</strong> (or Crypto)',
            'Tap the account icon &rarr; <strong>Statement</strong>',
            'Choose <strong>Excel / CSV</strong> format and download',
            'Upload the file below'
        ],
        note: 'Detects columns: Date, Ticker, Type, Quantity, Price per share. Only BUY transactions are imported.',
        broker: 'revolut',
    },
    {
        id: 'kraken',
        name: 'Kraken',
        subtitle: 'CSV Import',
        logo: `<span style="color:#5741D9;font-weight:900;font-size:20px;">K</span>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import your Kraken ledger CSV.',
        steps: [
            'Log in to <strong>Kraken.com</strong>',
            'Go to <strong>History &rarr; Export</strong>',
            'Select <strong>Ledgers</strong> as the export type',
            'Set date range and click <strong>Submit</strong>',
            'Download and upload the file below'
        ],
        note: 'Detects Kraken ledger format. Asset codes like XXBT and XETH are mapped to BTC and ETH automatically.',
        broker: 'kraken',
    },
    {
        id: 'ibkr',
        name: 'Interactive Brokers',
        subtitle: 'CSV Import',
        logo: `<span style="color:#E00;font-weight:900;font-size:16px;">IBKR</span>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import from Interactive Brokers Activity Statement.',
        steps: [
            'Log in to <strong>Client Portal</strong> or TWS',
            'Go to <strong>Reports &rarr; Activity &rarr; Statements</strong>',
            'Select <strong>Activity Statement</strong>, format <strong>CSV</strong>',
            'Download and upload the file below'
        ],
        note: 'Reads the Trades section automatically. Works with both Stocks and Forex/Crypto trades.',
        broker: 'ibkr',
    },
    {
        id: 'traderepublic',
        name: 'Trade Republic',
        subtitle: 'CSV Import',
        logo: `<span style="color:#0ACF83;font-weight:900;font-size:18px;">TR</span>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import from Trade Republic transaction export.',
        steps: [
            'Open the <strong>Trade Republic app</strong>',
            'Go to <strong>Profile &rarr; Documents</strong>',
            'Request a <strong>Transaction History</strong> export',
            'Wait for the email with the CSV attachment',
            'Upload the file below'
        ],
        note: 'Generic CSV parser used. Make sure columns include ISIN or ticker, quantity, and price.',
        broker: 'generic',
    },
    {
        id: 'generic',
        name: 'Other Broker',
        subtitle: 'Generic CSV',
        logo: `<i class="ph ph-file-csv" style="color:var(--secondary-accent);font-size:38px;"></i>`,
        badge: 'CSV',
        badgeClass: 'csv',
        method: 'csv',
        description: 'Import from any broker using a generic CSV format.',
        steps: [
            'Export your transaction history as CSV from your broker',
            'Make sure the file has columns for <strong>ticker/symbol/ISIN</strong>, <strong>quantity</strong>, and <strong>price</strong>',
            'Upload the file below'
        ],
        note: 'Required columns (any name): ticker/symbol/ISIN, qty/quantity/shares, price. Optional: date.',
        broker: 'generic',
    },
];

// ── Server-side Persistence ───────────────────────────────────
async function loadPortfolioFromServer() {
    try {
        const res = await fetch('/api/portfolio');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
            data.forEach(h => {
                const exists = manualHoldings.find(m =>
                    m.ticker === h.ticker && m.qty === h.qty && m.price === h.price
                );
                if (!exists) manualHoldings.push(h);
            });
            saveHoldings();
        }
    } catch (_) {}
}

async function savePortfolioToServer() {
    try {
        await fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manualHoldings)
        });
    } catch (_) {}
}

function saveHoldings() {
    localStorage.setItem('nexgen_portfolio_holdings', JSON.stringify(manualHoldings));
    savePortfolioToServer();
}

// ── Summary Cards ─────────────────────────────────────────────
function renderPortfolioSummary() {
    const pnlActual = manualHoldings.reduce((s, h) => {
        const live = marketData.find(m => m.symbol === h.ticker);
        const cur = live ? live.price : h.price;
        return s + h.qty * (cur - h.price);
    }, 0);

    let totalValue = 0;
    let totalCost = 0;
    manualHoldings.forEach(h => {
        const live = marketData.find(m => m.symbol === h.ticker);
        totalValue += h.qty * (live ? live.price : h.price);
        totalCost  += h.qty * h.price;
    });

    const cash = parseFloat(document.getElementById('cash-input')?.value) || 0;
    totalValue += cash;

    const pnlPct = totalCost > 0 ? (pnlActual / totalCost) * 100 : 0;

    const el = id => document.getElementById(id);
    if (el('pf-total-value')) el('pf-total-value').textContent = '$' + totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (el('pf-invested'))    el('pf-invested').textContent    = '$' + totalCost.toLocaleString(undefined,  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (el('pf-pnl')) {
        el('pf-pnl').textContent = (pnlActual >= 0 ? '+$' : '-$') + Math.abs(pnlActual).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        el('pf-pnl').style.color = pnlActual >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (el('pf-pnl-sub')) {
        el('pf-pnl-sub').textContent = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '% total return';
        el('pf-pnl-sub').style.color = pnlPct >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (el('pf-positions')) el('pf-positions').textContent = manualHoldings.length;
    if (el('total-balance')) animateValue(el('total-balance'), parseFloat((el('total-balance').textContent || '').replace(/[$,]/g, '')) || 0, totalValue, 900);
}

// ── Holdings Table ────────────────────────────────────────────
function renderPortfolioTable() {
    const tbody = document.getElementById('pf-holdings-tbody');
    const empty = document.getElementById('pf-holdings-empty');
    const wrap  = document.getElementById('pf-holdings-table-wrap');
    if (!tbody) return;

    if (!manualHoldings.length) {
        if (empty) empty.style.display = 'block';
        if (wrap)  wrap.style.display  = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (wrap)  wrap.style.display  = 'block';

    tbody.innerHTML = manualHoldings.map((h, idx) => {
        const live  = marketData.find(m => m.symbol === h.ticker);
        const cur   = live ? live.price : h.price;
        const val   = h.qty * cur;
        const pnl   = h.qty * (cur - h.price);
        const pnlP  = h.price > 0 ? ((cur - h.price) / h.price) * 100 : 0;
        const pos   = pnl >= 0;
        const img   = live?.image ? `<img src="${live.image}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">` : `<div class="asset-icon" style="width:28px;height:28px;font-size:12px;">${h.ticker[0]}</div>`;
        return `<tr>
            <td>
                <div class="asset-cell">
                    ${img}
                    <div>
                        <div style="font-weight:600;">${h.ticker}</div>
                        <div style="font-size:11px;color:var(--text-secondary);">${h.date || '--'}</div>
                    </div>
                </div>
            </td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:13px;">${h.qty.toLocaleString(undefined,{maximumFractionDigits:6})}</td>
            <td style="color:var(--text-secondary);">$${formatPrice(h.price)}</td>
            <td style="font-weight:600;">$${formatPrice(cur)}</td>
            <td style="font-weight:600;">$${formatPrice(val)}</td>
            <td class="${pos?'positive':'negative'}">
                ${pos?'+':''}${pnlP.toFixed(2)}%<br>
                <span style="font-size:11px;">${pos?'+$':'-$'}${Math.abs(pnl).toFixed(2)}</span>
            </td>
            <td>
                <button class="remove-btn btn-sm-action" data-idx="${idx}" style="color:var(--danger);border-color:var(--danger);">
                    <i class="ph ph-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            if (!isNaN(idx)) { manualHoldings.splice(idx, 1); saveHoldings(); renderPortfolioTable(); renderPortfolioSummary(); }
        });
    });
}

// ── Tab Switching ─────────────────────────────────────────────
function initTabs() {
    document.querySelectorAll('.pf-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.pf-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.pf-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
        });
    });
}

// ── Provider Grid ─────────────────────────────────────────────
function initProviderGrid() {
    const tilesEl = document.getElementById('provider-tiles');
    if (!tilesEl) return;

    tilesEl.innerHTML = PROVIDERS.map(p => `
        <div class="provider-tile" data-id="${p.id}">
            <div class="provider-tile-logo">${p.logo}</div>
            <div class="provider-tile-name">${p.name}</div>
            <div class="provider-tile-sub">${p.subtitle}</div>
            <span class="provider-badge ${p.badgeClass}">${p.badge}</span>
        </div>
    `).join('');

    tilesEl.querySelectorAll('.provider-tile').forEach(tile => {
        tile.addEventListener('click', () => showProviderDetail(tile.dataset.id));
    });
}

function showProviderDetail(id) {
    const p = PROVIDERS.find(x => x.id === id);
    if (!p) return;

    document.getElementById('provider-grid-view').classList.add('hidden');
    document.getElementById('provider-detail-view').classList.remove('hidden');

    // Header
    document.getElementById('provider-detail-header').innerHTML = `
        <div class="provider-tile-logo" style="font-size:48px;min-width:60px;">${p.logo}</div>
        <div>
            <h3 style="margin:0 0 4px;">${p.name}</h3>
            <p style="margin:0;font-size:14px;color:var(--text-secondary);">${p.description}</p>
        </div>
    `;

    // Instructions
    document.getElementById('provider-instructions').innerHTML = `
        <i class="ph ph-info" style="font-size:18px;color:var(--secondary-accent);flex-shrink:0;margin-top:2px;"></i>
        <div>
            <strong>How to export:</strong>
            <ol style="margin:8px 0 0;padding-left:18px;line-height:1.9;font-size:13px;">
                ${p.steps.map(s => `<li>${s}</li>`).join('')}
            </ol>
            ${p.note ? `<p style="margin:10px 0 0;font-size:12px;color:var(--text-secondary);">${p.note}</p>` : ''}
        </div>
    `;

    // Show correct fields
    const apiFields = document.getElementById('provider-api-fields');
    const csvFields = document.getElementById('provider-csv-fields');
    const statusEl  = document.getElementById('provider-status');

    apiFields.classList.add('hidden');
    csvFields.classList.add('hidden');
    statusEl.classList.add('hidden');

    if (p.method === 'api') {
        apiFields.classList.remove('hidden');
        document.getElementById('prov-api-connect-btn').dataset.provider = p.id;
    } else {
        csvFields.classList.remove('hidden');
        document.getElementById('csv-dropzone').dataset.broker = p.broker || 'generic';
        // Reset CSV state
        document.getElementById('csv-preview').classList.add('hidden');
        document.getElementById('csv-filename').classList.add('hidden');
        document.getElementById('csv-filename').textContent = '';
    }
}

// ── API Connect (Binance) ─────────────────────────────────────
function initAPIConnect() {
    const btn = document.getElementById('prov-api-connect-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const provider = btn.dataset.provider;
        const apiKey    = document.getElementById('prov-api-key')?.value.trim();
        const apiSecret = document.getElementById('prov-api-secret')?.value.trim();
        const statusEl  = document.getElementById('provider-status');

        if (!apiKey || !apiSecret) {
            showStatus(statusEl, 'error', '<i class="ph ph-warning"></i> Please enter both API Key and Secret.');
            return;
        }

        if (provider === 'binance') {
            showStatus(statusEl, 'loading', '<i class="ph ph-spinner ph-spin"></i> Connecting to Binance...');
            btn.disabled = true;
            try {
                const res = await fetch(`/api/binance/account?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`);
                if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
                const data = await res.json();
                if (data.code < 0) throw new Error(data.msg || 'Binance rejected the request.');

                const balances = (data.balances || []).filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0.000001);
                if (!balances.length) { showStatus(statusEl, 'success', '<i class="ph ph-check-circle"></i> Connected, but no non-zero balances found.'); return; }

                let added = 0;
                for (const b of balances) {
                    const qty = parseFloat(b.free) + parseFloat(b.locked);
                    const ticker = b.asset;
                    const live = marketData.find(m => m.symbol === ticker);
                    if (['USDT','USDC','BUSD','TUSD','FDUSD'].includes(ticker) && qty < 1) continue;
                    manualHoldings.push({ ticker, qty, price: live ? live.price : 0, date: 'Binance API' });
                    added++;
                }
                saveHoldings(); renderPortfolioTable(); renderPortfolioSummary();
                showStatus(statusEl, 'success', `<i class="ph ph-check-circle"></i> Synced ${added} asset${added !== 1 ? 's' : ''} from Binance.`);
                document.getElementById('prov-api-secret').value = '';
            } catch (err) {
                showStatus(statusEl, 'error', `<i class="ph ph-warning"></i> ${err.message}`);
            } finally {
                btn.disabled = false;
            }
        }
    });
}

// ── CSV Import ────────────────────────────────────────────────
let _parsedHoldings = [];

function initCSVImport() {
    const dropzone  = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    const importBtn = document.getElementById('csv-import-btn');
    const statusEl  = document.getElementById('provider-status');
    if (!dropzone || !fileInput) return;

    const handleFile = async (file) => {
        if (!file) return;
        const filenameEl = document.getElementById('csv-filename');
        filenameEl.textContent = file.name;
        filenameEl.classList.remove('hidden');

        const broker = dropzone.dataset.broker || 'generic';
        showStatus(statusEl, 'loading', `<i class="ph ph-spinner ph-spin"></i> Parsing ${file.name}...`);

        const text = await file.text();
        try {
            const res = await fetch(`/api/portfolio/import-csv?broker=${encodeURIComponent(broker)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: text
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Server parse failed');

            _parsedHoldings = data.holdings || [];
            if (!_parsedHoldings.length) {
                showStatus(statusEl, 'error', '<i class="ph ph-warning"></i> No valid positions found. Check your file has ticker/ISIN, quantity, and price columns.');
                document.getElementById('csv-preview').classList.add('hidden');
                return;
            }

            document.getElementById('csv-row-count').textContent = _parsedHoldings.length;
            document.getElementById('csv-preview-body').innerHTML = _parsedHoldings.map(h => `
                <tr>
                    <td style="font-weight:600;">${h.ticker}</td>
                    <td>${parseFloat(h.qty).toLocaleString(undefined,{maximumFractionDigits:6})}</td>
                    <td>${h.price ? '$' + parseFloat(h.price).toFixed(2) : '--'}</td>
                    <td style="color:var(--text-secondary);">${h.date || '--'}</td>
                </tr>
            `).join('');
            document.getElementById('csv-preview').classList.remove('hidden');
            showStatus(statusEl, 'success', `<i class="ph ph-check-circle"></i> ${_parsedHoldings.length} position${_parsedHoldings.length !== 1 ? 's' : ''} detected. Review and click Import.`);
        } catch (err) {
            showStatus(statusEl, 'error', `<i class="ph ph-warning"></i> ${err.message}`);
        }
    };

    dropzone.addEventListener('click', e => { if (!e.target.closest('label')) fileInput.click(); });
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault(); dropzone.classList.remove('drag-over');
        handleFile(e.dataTransfer.files[0]);
    });

    importBtn?.addEventListener('click', () => {
        if (!_parsedHoldings.length) return;
        _parsedHoldings.forEach(h => {
            manualHoldings.push({ ticker: h.ticker, qty: parseFloat(h.qty), price: parseFloat(h.price) || 0, date: h.date || 'CSV import' });
        });
        saveHoldings(); renderPortfolioTable(); renderPortfolioSummary();
        showStatus(document.getElementById('provider-status'), 'success',
            `<i class="ph ph-check-circle"></i> Imported ${_parsedHoldings.length} position${_parsedHoldings.length !== 1 ? 's' : ''}.`);
        document.getElementById('csv-preview').classList.add('hidden');
        _parsedHoldings = [];
    });
}

// ── Back button ───────────────────────────────────────────────
function initBackButton() {
    document.getElementById('provider-back-btn')?.addEventListener('click', () => {
        document.getElementById('provider-grid-view').classList.remove('hidden');
        document.getElementById('provider-detail-view').classList.add('hidden');
    });
}

// ── Clear All ─────────────────────────────────────────────────
function initClearAll() {
    document.getElementById('clear-all-btn')?.addEventListener('click', () => {
        if (!manualHoldings.length) return;
        if (!confirm(`Remove all ${manualHoldings.length} holdings from your portfolio?`)) return;
        manualHoldings.length = 0;
        saveHoldings(); renderPortfolioTable(); renderPortfolioSummary();
    });
}

// ── Helpers ───────────────────────────────────────────────────
function showStatus(el, type, html) {
    if (!el) return;
    el.className = `pf-status ${type}`;
    el.innerHTML = html;
    el.classList.remove('hidden');
}

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadPortfolioFromServer();

    initTabs();
    initProviderGrid();
    initAPIConnect();
    initCSVImport();
    initBackButton();
    initClearAll();

    renderPortfolioTable();
    renderPortfolioSummary();

    // Re-render on market data or holdings changes
    let _lastDataLen = marketData.length;
    let _lastHoldingsLen = manualHoldings.length;
    setInterval(() => {
        const changed = marketData.length !== _lastDataLen || manualHoldings.length !== _lastHoldingsLen;
        _lastDataLen = marketData.length;
        _lastHoldingsLen = manualHoldings.length;
        if (changed) { renderPortfolioTable(); renderPortfolioSummary(); }
    }, 500);
});
