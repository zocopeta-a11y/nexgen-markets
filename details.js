// --- MARKET STATUS ENGINE ---
function getMarketState(type) {
    if (type?.toLowerCase() === 'crypto') {
        return { state: 'OPEN', label: 'ALWAYS OPEN', icon: 'ph-sun', class: 'open' };
    }

    const now = new Date();
    const estDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) - (4 * 3600000));
    const day = estDate.getDay();
    const hours = estDate.getHours();
    const minutes = estDate.getMinutes();
    const timeValue = hours * 100 + minutes;

    const isWeekend = day === 0 || day === 6;
    if (isWeekend) return { state: 'CLOSED', label: 'MARKET CLOSED', icon: 'ph-moon', class: 'closed' };

    if (timeValue >= 400 && timeValue < 930) {
        return { state: 'PRE', label: 'PRE-OPEN', icon: 'ph-sun', class: 'pre' };
    } else if (timeValue >= 930 && timeValue < 1600) {
        return { state: 'OPEN', label: 'MARKET OPEN', icon: 'ph-sun', class: 'open' };
    } else if (timeValue >= 1600 && timeValue < 2000) {
        return { state: 'AFTER', label: 'AFTER HOURS', icon: 'ph-moon', class: 'after' };
    } else {
        return { state: 'CLOSED', label: 'MARKET CLOSED', icon: 'ph-moon', class: 'closed' };
    }
}

function updateMarketStatusUI() {
    const assetType = assetData?.type || 'Equity';
    const status = getMarketState(assetType);
    
    const headerBadge = document.getElementById('market-status-badge');
    const chartBadge = document.getElementById('chart-market-status');
    
    if (headerBadge) {
        headerBadge.className = `market-badge status-mini ${status.class}`;
        headerBadge.innerHTML = `<i class="ph ${status.icon}"></i> ${status.label}`;
    }
    
    if (chartBadge) {
        chartBadge.className = `status-mini ${status.class}`;
        chartBadge.innerHTML = `<i class="ph ${status.icon}"></i> ${status.state}`;
        chartBadge.style.display = 'inline-flex';
    }
}

// --- ASSET DATA ENGINE ---
let assetData = null;
async function fetchAssetDetails(symbol) {
    try {
        const cryptoCurrencies = ['BTC', 'ETH', 'SOL', 'USDT', 'BNB', 'XRP', 'USDC', 'ADA', 'DOGE', 'AVAX', 'LTC', 'DOT', 'LINK', 'MATIC', 'UNI', 'ATOM', 'NEAR', 'APT'];
        const isCrypto = cryptoCurrencies.includes(symbol.toUpperCase());

        // Always fetch a fresh price from Yahoo Finance — never rely on potentially
        // stale localStorage cache for the headline price.
        const querySymbol = isCrypto ? `${symbol.toUpperCase()}-USD` : symbol;
        const res = await fetch(`/api/quote?symbols=${querySymbol}`);
        const data = await res.json();
        const quote = data.quoteResponse.result[0];

        if (!quote) throw new Error("Asset not found");

        const chg = quote.regularMarketChangePercent || 0;

        // For crypto, supplement with CoinGecko cache (mcap, vol) only if fresh (<10 min)
        let mcap = formatLargeNumber(quote.marketCap || 0);
        let vol  = formatLargeNumber(quote.regularMarketVolume || 0);
        let cgName = null;
        if (isCrypto) {
            try {
                const ts = parseInt(localStorage.getItem('nexgen_market_data_ts') || '0');
                if (Date.now() - ts < 10 * 60 * 1000) {
                    const cached = JSON.parse(localStorage.getItem('nexgen_market_data') || '[]');
                    const cg = cached.find(m => m.symbol === symbol.toUpperCase() && m.type === 'crypto');
                    if (cg) {
                        if (cg.mcap && cg.mcap !== 'N/A') mcap = cg.mcap;
                        if (cg.vol  && cg.vol  !== 'N/A') vol  = cg.vol;
                        cgName = cg.name || null;
                    }
                }
            } catch (_) {}
        }

        return {
            symbol: symbol.toUpperCase(),
            name: cgName || quote.shortName || quote.longName || quote.symbol,
            type: isCrypto ? 'Crypto' : 'Equity',
            price: quote.regularMarketPrice || 0,
            change: chg,
            open: quote.regularMarketOpen || 0,
            dayHigh: quote.regularMarketDayHigh || 0,
            dayLow: quote.regularMarketDayLow || 0,
            dollarChange: quote.regularMarketChange || 0,
            prevClose: quote.previousClose || 0,
            mcap,
            vol,
            h52: quote.fiftyTwoWeekHigh || null,
            l52: quote.fiftyTwoWeekLow  || null,
            signal: chg > 2 ? 'Strong Buy' : chg > 0 ? 'Buy' : chg < -2 ? 'Sell' : 'Hold',
            desc: isCrypto
                ? `Real-time price from Yahoo Finance. Market cap & volume from CoinGecko.`
                : `Data from Yahoo Finance (15–20 min delayed for US equities).`
        };
    } catch (err) {
        console.error("Fetch failed for asset details", err);
        return null;
    }
}

function formatPrice(num) {
    if (!num) return 'N/A';
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLargeNumber(num) {
    if (!num) return 'N/A';
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    return '$' + num.toLocaleString();
}


// --- CUSTOM CHART ENGINE (Lightweight Charts) ---
let chart = null;
let lineSeries = null;
let currentRange = '1d';

async function loadChartData(range) {
    if (!assetData) return;
    
    try {
        // Range mapping for Yahoo Finance
        let interval = '1d';
        if (range === '1d')       interval = '2m';
        else if (range === '5d')  interval = '15m';
        else if (range === '1mo') interval = '60m';
        else if (range === '6mo') interval = '1d';
        else if (range === '1y')  interval = '1d';
        else if (range === 'max') interval = '1wk';

        // Crypto symbols need the -USD suffix for Yahoo Finance chart endpoint
        const cryptoCurrencies = ['BTC', 'ETH', 'SOL', 'USDT', 'BNB', 'XRP', 'USDC', 'ADA', 'DOGE', 'AVAX', 'LTC', 'DOT', 'LINK', 'MATIC', 'UNI'];
        const chartSymbol = cryptoCurrencies.includes(assetData.symbol.toUpperCase())
            ? `${assetData.symbol.toUpperCase()}-USD`
            : assetData.symbol;
        
        const res = await fetch(`/api/chart?symbol=${chartSymbol}&range=${range}&interval=${interval}`);
        const data = await res.json();
        
        if (!data.chart || !data.chart.result) throw new Error("No chart data");
        
        const result = data.chart.result[0];
        const timestamps = result.timestamp;
        const indicators = result.indicators.quote[0];
        
        const chartData = [];
        const volumeData = [];
        const smaData = [];
        const seenTimes = new Set();
        
        // Helper for SMA
        const period = 20;
        const pricesForSma = [];

        for (let i = 0; i < timestamps.length; i++) {
            const t = timestamps[i];
            if (seenTimes.has(t)) continue; // LightweightCharts errors on duplicate times
            
            const closePrice = indicators.close[i];
            if (closePrice == null) continue;

            if (currentStyle === 'candle') {
                if (indicators.open[i] == null || indicators.high[i] == null ||
                    indicators.low[i]  == null) continue;
                chartData.push({
                    time: t,
                    open:  indicators.open[i],
                    high:  indicators.high[i],
                    low:   indicators.low[i],
                    close: closePrice
                });
            } else {
                chartData.push({ time: t, value: closePrice });
            }
            
            // Volume
            const vol = indicators.volume ? indicators.volume[i] : null;
            const color = (i > 0 && closePrice < indicators.close[i-1]) ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)';
            if (vol != null) {
                volumeData.push({ time: t, value: vol, color: color });
            }
            
            // SMA
            pricesForSma.push(closePrice);
            if (pricesForSma.length >= period) {
                const sum = pricesForSma.slice(-period).reduce((a, b) => a + b, 0);
                smaData.push({ time: t, value: sum / period });
            }

            seenTimes.add(t);
        }

        if (chartData.length === 0) throw new Error("Processed data is empty");

        currentSeries.setData(chartData);
        volumeSeries.setData(volumeData);
        smaSeries.setData(smaData);
        chart.timeScale().fitContent();

        // Update Chart Header
        const last = chartData[chartData.length - 1];
        const first = chartData[0];
        const latestPrice = last.value != null ? last.value : last.close;
        const firstPrice  = first.value != null ? first.value : first.open;
        const change = ((latestPrice - firstPrice) / firstPrice * 100).toFixed(2);
        
        document.getElementById('chart-display-symbol').textContent = assetData.symbol;
        document.getElementById('chart-display-price').textContent = '$' + latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2 });

        const changeEl = document.getElementById('chart-display-change');
        changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
        changeEl.className = `change-mini ${change >= 0 ? 'positive' : 'negative'}`;

        // Show a note when the market is closed and we're on the 1D view
        const existingNote = document.getElementById('chart-closed-note');
        if (existingNote) existingNote.remove();
        const status = getMarketState(assetData?.type || 'Equity');
        if (range === '1d' && status.state === 'CLOSED' && assetData?.type !== 'Crypto') {
            const note = document.createElement('div');
            note.id = 'chart-closed-note';
            note.style.cssText = 'text-align:center;font-size:12px;color:var(--text-secondary);padding:6px 0 0;';
            note.innerHTML = '<i class="ph ph-moon"></i> Market closed — showing last trading session';
            document.getElementById('custom-chart-container').after(note);
        }

    } catch (err) {
        console.error("Chart load failed", err);
    }
}

let currentStyle = 'area';
let currentSeries = null;
let volumeSeries = null;
let smaSeries = null;

function initCustomChart() {
    const container = document.getElementById('custom-chart-container');
    if (!container) return;

    container.innerHTML = '';

    chart = LightweightCharts.createChart(container, {
        autoSize: true,
        layout: {
            background: { type: 'solid', color: '#18181B' },
            textColor: '#A1A1AA',
            fontFamily: "'Outfit', 'Inter', sans-serif",
        },
        grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
        },
        rightPriceScale: {
            borderVisible: false,
            scaleMargins: { top: 0.15, bottom: 0.1 },
        },
        timeScale: {
            borderVisible: false,
            timeVisible: true,
            secondsVisible: false,
        },
        crosshair: {
            vertLine: { color: 'rgba(226, 114, 91, 0.4)', width: 1, style: 0 },
            horzLine: { color: 'rgba(226, 114, 91, 0.4)', width: 1, style: 0 },
        },
    });

    // Add Volume Series with scale margins at the bottom
    volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // set as an overlay by setting a blank priceScaleId
    });
    
    chart.priceScale('').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Add SMA Series
    smaSeries = chart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(255, 192, 0, 0.8)',
        lineWidth: 2,
        visible: false,
        crosshairMarkerVisible: false,
    });

    createSeries('area');

    // Time Range Buttons
    document.querySelectorAll('.tr-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.tr-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            await loadChartData(btn.dataset.range);
        });
    });

    // Settings Toggle
    const settingsBtn = document.getElementById('chart-settings-btn');
    const settingsPanel = document.getElementById('chart-settings-panel');
    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.toggle('hidden');
        });
        document.addEventListener('click', () => settingsPanel.classList.add('hidden'));
        settingsPanel.addEventListener('click', (e) => e.stopPropagation());
    }

    // Settings Logic
    document.getElementById('toggle-grid')?.addEventListener('change', (e) => {
        chart.applyOptions({
            grid: {
                vertLines: { visible: e.target.checked, color: 'rgba(255, 255, 255, 0.06)' },
                horzLines: { visible: e.target.checked, color: 'rgba(255, 255, 255, 0.04)' },
            }
        });
    });

    document.getElementById('toggle-gradient')?.addEventListener('change', (e) => {
        if (currentStyle === 'area') {
            currentSeries.applyOptions({
                topColor: e.target.checked ? 'rgba(226, 114, 91, 0.3)' : 'rgba(226, 114, 91, 0.0)',
                bottomColor: 'rgba(226, 114, 91, 0.0)',
            });
        }
    });

    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = btn.dataset.style;
            if (style === currentStyle) return;
            
            document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            createSeries(style);
            const activeRange = document.querySelector('.tr-btn.active')?.dataset.range || 'max';
            loadChartData(activeRange);
        });
    });

    document.getElementById('toggle-volume')?.addEventListener('change', (e) => {
        if (volumeSeries) volumeSeries.applyOptions({ visible: e.target.checked });
    });

    document.getElementById('toggle-sma')?.addEventListener('change', (e) => {
        if (smaSeries) smaSeries.applyOptions({ visible: e.target.checked });
    });

    // Set 1D button active by default
    document.querySelectorAll('.tr-btn').forEach(b => b.classList.remove('active'));
    const defaultBtn = document.querySelector('.tr-btn[data-range="1d"]');
    if (defaultBtn) defaultBtn.classList.add('active');

    loadChartData('1d');
}

function createSeries(style) {
    if (currentSeries) {
        chart.removeSeries(currentSeries);
    }
    
    currentStyle = style;
    
    if (style === 'candle') {
        currentSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: '#10B981',
            downColor: '#EF4444',
            borderVisible: false,
            wickUpColor: '#10B981',
            wickDownColor: '#EF4444',
        });
    } else {
        const hasGradient = document.getElementById('toggle-gradient')?.checked ?? true;
        currentSeries = chart.addSeries(LightweightCharts.AreaSeries, {
            lineColor: '#E2725B',
            topColor: hasGradient ? 'rgba(226, 114, 91, 0.4)' : 'rgba(226, 114, 91, 0.0)',
            bottomColor: 'rgba(226, 114, 91, 0.0)',
            lineWidth: 2,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
    }
}

// --- INITIALIZATION ---
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const symbolParam = urlParams.get('symbol') || 'BTC'; 

    // Async data fetch
    assetData = await fetchAssetDetails(symbolParam);

    if (!assetData) {
        // Final fallback UI if everything fails
        document.getElementById('loading-state').innerHTML = `<div style="text-align:center;"><i class="ph ph-warning" style="font-size: 48px; color: var(--danger);"></i><p>Asset data unavailable.</p><button onclick="window.history.back()" class="btn-primary" style="margin-top:20px;">Return</button></div>`;
        return;
    }

    // Fill UI — wait for DOM to paint before measuring chart container
    setTimeout(() => {
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('details-content').style.display = 'block';
        updateMarketStatusUI();
        // Double rAF ensures layout/paint has occurred so clientWidth is correct
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                initCustomChart();
            });
        });
    }, 500);

    // Initial Header & Stats
    document.title = `${symbolParam} | NexGen Real-Time`;
    document.getElementById('header-symbol').textContent = symbolParam.toUpperCase();
    document.getElementById('header-name').textContent = assetData.name;
    document.getElementById('header-icon').textContent = symbolParam.charAt(0).toUpperCase();
    document.getElementById('header-type').textContent = assetData.type;
    document.getElementById('header-price').textContent = assetData.price ? '$' + assetData.price.toLocaleString() : 'Live';

    const changeEl = document.getElementById('header-change');
    changeEl.textContent = (assetData.change >= 0 ? '+' : '') + assetData.change.toFixed(2) + '%';
    changeEl.className = `change-badge ${assetData.change >= 0 ? 'positive' : 'negative'} badge`;

    document.getElementById('stat-open').textContent = assetData.open ? formatPrice(assetData.open) : 'N/A';
    document.getElementById('stat-range').textContent = (assetData.dayLow && assetData.dayHigh)
        ? `${formatPrice(assetData.dayLow)} – ${formatPrice(assetData.dayHigh)}`
        : 'N/A';
    const dchg = assetData.dollarChange;
    const dchgEl = document.getElementById('stat-dollar-chg');
    dchgEl.textContent = dchg ? (dchg >= 0 ? '+$' : '-$') + Math.abs(dchg).toFixed(2) : 'N/A';
    dchgEl.style.color = dchg >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('stat-prev-close').textContent = assetData.prevClose ? formatPrice(assetData.prevClose) : 'N/A';
    document.getElementById('stat-mcap').textContent = assetData.mcap;
    document.getElementById('stat-vol').textContent = assetData.vol;
    document.getElementById('stat-52h').textContent = assetData.h52 ? formatPrice(assetData.h52) : 'N/A';
    document.getElementById('stat-52l').textContent = assetData.l52 ? formatPrice(assetData.l52) : 'N/A';
    document.getElementById('stat-signal').textContent = assetData.signal || 'Analyze';

    document.getElementById('about-desc').textContent = assetData.desc;

    // Tags
    const tagsContainer = document.getElementById('asset-tags');
    tagsContainer.innerHTML = '';
    const tags = [assetData.type, 'Live Market', 'Minute-by-Minute', 'TradingView Core'];
    tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tag;
        tagsContainer.appendChild(span);
    });

    // Global Search
    const searchInput = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-dropdown');
    const list = document.getElementById('search-results-list');

    if (searchInput && dropdown && list) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            
            if (query.length < 1) { dropdown.classList.add('hidden'); return; }
            
            const storedData = localStorage.getItem('nexgen_market_data');
            let globalMarketData = [];
            if (storedData) {
                try { globalMarketData = JSON.parse(storedData); } catch (e) { }
            }

            const filtered = globalMarketData.filter(item => 
                item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
            ).slice(0, 10);

            const searchCountEl = document.getElementById('search-count');
            if (searchCountEl) searchCountEl.textContent = `${filtered.length} found`;

            list.innerHTML = filtered.map(item => `
                <li class="search-result-item" onclick="window.location.href='details.html?symbol=${item.symbol}'">
                    <div class="search-result-info">
                        ${item.image 
                            ? `<img src="${item.image}" alt="${item.symbol}" class="search-result-icon" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`
                            : `<div class="search-result-icon" style="width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:10px;">${item.symbol[0]}</div>`
                        }
                        <div class="search-result-text">
                            <span class="search-result-symbol" style="font-weight:700; font-size:14px;">${item.symbol}</span>
                            <span class="search-result-name" style="font-size:11px; color:var(--text-secondary); max-width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:600; font-size:13px;">$${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                        <span style="font-size:11px; color:${item.change >= 0 ? 'var(--success)' : 'var(--danger)'}">${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%</span>
                    </div>
                </li>
            `).join('');
            
            if (filtered.length === 0) {
                list.innerHTML = `<li style="padding: 16px; text-align: center; color: var(--text-secondary); font-size:13px;">No results found.</li>`;
            }

            dropdown.classList.remove('hidden');
        });

        // Hide search dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#global-search-container')) {
                dropdown.classList.add('hidden');
            }
        });
    }

    // Legacy Trade Logic Removed

    function updateHoldingsDisplay() {
        const holdings = JSON.parse(localStorage.getItem('nexgen_portfolio_holdings')) || [];
        const totalOwned = holdings.filter(h => h.ticker.toUpperCase() === symbolParam.toUpperCase()).reduce((sum, h) => sum + h.qty, 0);
        const info = document.getElementById('holdings-info');
        if (totalOwned > 0 && info) {
            document.getElementById('owned-qty').textContent = totalOwned.toFixed(4);
            document.getElementById('owned-symbol').textContent = symbolParam.toUpperCase();
            info.classList.remove('hidden');
        }
    }
    updateHoldingsDisplay();
}

document.addEventListener('DOMContentLoaded', init);

