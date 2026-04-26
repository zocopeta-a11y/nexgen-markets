/* ================================================================
   NexGen Markets — unified client app
   (c) NexGen. Single-init, bug-fixed, real-time-feel rewrite.
   ================================================================ */

'use strict';

// ---------- STATE ----------
let lastRefreshTime = new Date();
let marketData = [];
let refreshInFlight = false;
let jitterTimer = null;

// DOM handles resolved at DOMContentLoaded time
let cryptoTableBody, stockTableBody, smallcapTableBody, intlTableBody, indexTableBody, commodityTableBody;
let topPicksContainer, totalBalanceEl, cashInput, holdingsList, strategyStatus, analysisOutput, analyzeBtn;

// ---------- STATIC CONFIG ----------
const CRYPTO_PAIR_SYMS = ['BTC', 'ETH', 'SOL', 'USDT', 'BNB', 'XRP', 'USDC', 'ADA', 'DOGE', 'AVAX',
    'LTC', 'DOT', 'LINK', 'MATIC', 'UNI', 'ATOM', 'NEAR', 'APT'];

const TICKER_FAVS = ['BTC', 'ETH', 'SOL', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'GLD'];

const topPicks = [
    { symbol: 'PLTR', name: 'Palantir Tech', price: 34.50, reason: 'Government AI contracts surging. Expanding into commercial sector with AIP.', gradient: 'linear-gradient(135deg, rgba(138, 154, 91, 0.18), transparent)' },
    { symbol: 'ASTS', name: 'AST SpaceMobile', price: 18.20, reason: 'Direct-to-cell satellite tech. Strategic deals with AT&T and Verizon.', gradient: 'linear-gradient(135deg, rgba(226, 114, 91, 0.18), transparent)' },
    { symbol: 'RKLB', name: 'Rocket Lab', price: 9.80, reason: 'Second most frequent launcher after SpaceX. Neutron rocket on track.', gradient: 'linear-gradient(135deg, rgba(138, 154, 91, 0.18), transparent)' },
    { symbol: 'SOFI', name: 'SoFi Technologies', price: 7.90, reason: 'Rapid member growth. Achieving GAAP profitability on a scalable platform.', gradient: 'linear-gradient(135deg, rgba(226, 114, 91, 0.18), transparent)' }
];

const providerAssets = {
    'binance':   [{ ticker: 'BTC',  qty: 0.25, price: 62500, date: 'Synced from Binance'  }, { ticker: 'ETH', qty: 4.5, price: 3450, date: 'Synced from Binance'  }],
    'coinbase':  [{ ticker: 'BTC',  qty: 0.10, price: 63000, date: 'Synced from Coinbase' }, { ticker: 'COIN', qty: 25, price: 210, date: 'Synced from Coinbase' }],
    'robinhood': [{ ticker: 'AAPL', qty: 10,   price: 215,   date: 'Synced from Robinhood'}, { ticker: 'TSLA', qty: 5, price: 245, date: 'Synced from Robinhood'}],
    'indexa':    [{ ticker: 'VWCE', qty: 12,   price: 115,   date: 'Synced from Indexa'   }, { ticker: 'IWDA', qty: 20, price: 85, date: 'Synced from Indexa'   }]
};

const newsFallback = [
    { title: 'Market Rally',        desc: 'Tech megacaps surge following positive earnings reports.',     icon: 'ph-trend-up',       type: 'positive' },
    { title: 'Crypto Volatility',   desc: 'Bitcoin sees a 5% drop amid new regulatory rumors in Asia.',   icon: 'ph-warning-circle', type: 'negative' },
    { title: 'AI Revolution',       desc: 'Major investments in AI infrastructure; semiconductors jump.', icon: 'ph-cpu',            type: 'positive' },
    { title: 'Fed Commentary',      desc: 'Federal Reserve hints at holding rates for the next quarter.', icon: 'ph-bank',           type: 'neutral'  },
    { title: 'Energy Sector',       desc: 'Oil prices stabilize after a week of turbulence.',             icon: 'ph-gas-pump',       type: 'neutral'  },
    { title: 'Small-Cap Breakout',  desc: 'AST SpaceMobile signs a major contract; shares up 15%.',       icon: 'ph-rocket',         type: 'positive' }
];

let manualHoldings = [];
try { manualHoldings = JSON.parse(localStorage.getItem('nexgen_portfolio_holdings')) || []; } catch (_) { manualHoldings = []; }
function saveHoldings() { localStorage.setItem('nexgen_portfolio_holdings', JSON.stringify(manualHoldings)); }

// ---------- MARKET STATUS ----------
function getMarketState(type) {
    if (type === 'crypto') return { state: 'OPEN', label: 'ALWAYS OPEN', icon: 'ph-sun', class: 'open' };

    // US Market Hours (approx EST, no DST correction; good enough for UX)
    const now = new Date();
    const estDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) - (4 * 3600000));
    const day = estDate.getDay();
    const timeValue = estDate.getHours() * 100 + estDate.getMinutes();

    if (day === 0 || day === 6) return { state: 'CLOSED', label: 'MARKET CLOSED', icon: 'ph-moon', class: 'closed' };
    if (timeValue >= 400  && timeValue < 930)  return { state: 'PRE',    label: 'PRE-MARKET',    icon: 'ph-sun',  class: 'pre'    };
    if (timeValue >= 930  && timeValue < 1600) return { state: 'OPEN',   label: 'MARKET OPEN',   icon: 'ph-sun',  class: 'open'   };
    if (timeValue >= 1600 && timeValue < 2000) return { state: 'AFTER',  label: 'AFTER HOURS',   icon: 'ph-moon', class: 'after'  };
    return { state: 'CLOSED', label: 'MARKET CLOSED', icon: 'ph-moon', class: 'closed' };
}

function checkMarketStatus() {
    const status = getMarketState('equities');
    const badge = document.getElementById('market-status-badge');
    const text  = document.getElementById('market-status-text');
    if (badge && text) {
        badge.className = `market-badge ${status.class}`;
        text.innerHTML = `<i class="ph ${status.icon}"></i> ${status.label}`;
    }
    updateSectionBadges();
    return status.state === 'OPEN';
}

function updateSectionBadges() {
    const sections = [
        { id: 'crypto-market',    type: 'crypto'   },
        { id: 'stock-market',     type: 'equities' },
        { id: 'index-market',     type: 'equities' },
        { id: 'intl-market',      type: 'equities' },
        { id: 'commodity-market', type: 'equities' }
    ];
    sections.forEach(sec => {
        const section = document.getElementById(sec.id);
        if (!section) return;
        const badge = section.querySelector('.section-header .badge');
        if (!badge) return;
        const status = getMarketState(sec.type);
        badge.className = `badge status-mini ${status.class}`;
        badge.innerHTML = `<i class="ph ${status.icon}" style="font-size:14px;"></i> ${status.label}`;
    });
}

// ---------- "LAST UPDATED" LABEL ----------
function updateLastUpdatedLabel() {
    const el = document.getElementById('last-updated-time');
    if (!el) return;
    const diff = Math.floor((Date.now() - lastRefreshTime.getTime()) / 1000);
    if (diff < 5)      el.textContent = 'Live · just now';
    else if (diff < 60) el.textContent = `Live · ${diff}s ago`;
    else                el.textContent = `Live · ${Math.floor(diff / 60)}m ago`;
}

// ---------- DATA FETCHING ----------
async function fetchStockCategory(symbols, categoryType) {
    try {
        const res = await fetch(`/api/quote?symbols=${symbols}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const results = (data.quoteResponse && data.quoteResponse.result) || [];
        return results.map(quote => {
            const price = quote.regularMarketPrice || 0;
            const chg = quote.regularMarketChangePercent || 0;
            return {
                symbol: quote.symbol,
                name: quote.shortName || quote.longName || quote.symbol,
                type: categoryType,
                price,
                high: quote.regularMarketDayHigh || price,
                low:  quote.regularMarketDayLow  || price,
                change: chg,
                mcap: formatLargeNumber(quote.marketCap || 0),
                vol:  formatLargeNumber(quote.regularMarketVolume || 0),
                pe: quote.forwardPE ? quote.forwardPE.toFixed(1) : 'N/A',
                recommendation: chg > 2 ? 'strong-buy' : chg > 0 ? 'buy' : chg < -2 ? 'sell' : 'hold',
                recText:        chg > 2 ? 'Strong Buy' : chg > 0 ? 'Buy' : chg < -2 ? 'Sell' : 'Hold',
                desc: `Real-time ${categoryType} data from Yahoo Finance.`,
                image: '',
                hist: generateRandomWalkHistory(price, chg)
            };
        });
    } catch (err) {
        console.error(`Fetch failed for ${categoryType}:`, err);
        return [];
    }
}

async function fetchCryptoData() {
    try {
        const res = await fetch('/api/crypto');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map(coin => {
            const chg = coin.price_change_percentage_24h || 0;
            const price = coin.current_price || 0;
            // Use real CoinGecko 7-day sparkline (hourly, 168 points)
            const spark7d = coin.sparkline_in_7d?.price || [];
            const hist = spark7d.length >= 24 ? {
                '1D':  spark7d.slice(-24),
                '1W':  spark7d,
                '1M':  generateRandomWalkHistory(price, chg)['1M'],
                'ALL': generateRandomWalkHistory(price, chg)['ALL']
            } : generateRandomWalkHistory(price, chg);
            return {
                symbol: (coin.symbol || '').toUpperCase(),
                name: coin.name,
                type: 'crypto',
                price,
                high:  coin.high_24h || price,
                low:   coin.low_24h  || price,
                change: chg,
                recommendation: chg > 5 ? 'strong-buy' : chg > 0 ? 'buy' : chg < -5 ? 'sell' : 'hold',
                recText:        chg > 5 ? 'Strong Buy' : chg > 0 ? 'Buy' : chg < -5 ? 'Sell' : 'Hold',
                mcap: formatLargeNumber(coin.market_cap),
                vol:  formatLargeNumber(coin.total_volume),
                pe: 'N/A',
                desc: `The cryptocurrency ${coin.name} (${(coin.symbol || '').toUpperCase()}) — real-time data from CoinGecko.`,
                image: coin.image,
                hist
            };
        });
    } catch (err) {
        console.error('Failed to fetch crypto:', err);
        return [];
    }
}

async function refreshData() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    setLiveIndicator(true);
    try {
        const [cryptoData, equityData, smallCapData, intlData, indexData, commodityData] = await Promise.all([
            fetchCryptoData(),
            fetchStockCategory('AAPL,MSFT,NVDA,GOOGL,AMZN,META,TSLA,BRK-B,LLY,V,UNH,JPM,JNJ,XOM,MA,AVGO,HD,PG,COST,ABBV', 'megacap'),
            fetchStockCategory('PLTR,ASTS,RKLB,SOFI,IONQ,JOBY,MSTR,HIMS,SMCI,PATH,OKLO,LUNR,BROS,RDDT,ARM', 'smallcap'),
            fetchStockCategory('IAG.L,IAG.MC,AENA.MC,ITX.MC,SAN.MC,BBVA.MC,IBE.MC,REP.MC,TEF.MC,LHA.DE,AF.PA,RYAAY,EZJ.L', 'international'),
            fetchStockCategory('^GSPC,^IXIC,^DJI,^RUT,^N225,^FTSE,^GDAXI,^FCHI,^HSI', 'index'),
            fetchStockCategory('GC=F,SI=F,CL=F,NG=F,HG=F,KC=F,CC=F,SB=F', 'commodity')
        ]);

        // Override top crypto prices with a fresh Yahoo Finance quote (more reliable
        // for current price than CoinGecko's free tier which can be delayed/stale).
        try {
            const YF_CRYPTO = 'BTC-USD,ETH-USD,SOL-USD,BNB-USD,XRP-USD,ADA-USD,DOGE-USD,AVAX-USD,LTC-USD,DOT-USD,LINK-USD,MATIC-USD,UNI-USD,ATOM-USD,NEAR-USD,APT-USD';
            const yfCryptoRes = await fetch(`/api/quote?symbols=${YF_CRYPTO}`);
            if (yfCryptoRes.ok) {
                const yfCryptoData = await yfCryptoRes.json();
                const yfMap = {};
                (yfCryptoData.quoteResponse?.result || []).forEach(q => {
                    yfMap[q.symbol.replace('-USD', '')] = q.regularMarketPrice;
                });
                cryptoData.forEach(coin => {
                    if (yfMap[coin.symbol] && yfMap[coin.symbol] > 0) {
                        coin.price = yfMap[coin.symbol];
                    }
                });
            }
        } catch (_) {}

        marketData = [...cryptoData, ...equityData, ...smallCapData, ...intlData, ...indexData, ...commodityData];
        try {
            localStorage.setItem('nexgen_market_data', JSON.stringify(marketData));
            localStorage.setItem('nexgen_market_data_ts', Date.now().toString());
        } catch (_) {}
        lastRefreshTime = new Date();

        updateTickerTape(marketData);
        renderMarketSection(cryptoTableBody,    'crypto', 12);
        renderMarketSection(stockTableBody,     'megacap');
        renderMarketSection(smallcapTableBody,  'smallcap');
        renderMarketSection(intlTableBody,      'international');
        renderMarketSection(indexTableBody,     'index');
        renderMarketSection(commodityTableBody, 'commodity');

        checkMarketStatus();
        renderTopPicks();
        renderMovers();
        renderHoldings();
        updateTotalBalance();
        updateLastUpdatedLabel();
    } finally {
        refreshInFlight = false;
        setTimeout(() => setLiveIndicator(false), 400);
    }
}

// ---------- SPARKLINE HISTORY (real-feeling random walk) ----------
function generateRandomWalkHistory(currentPrice, changePercent = 0) {
    const series = (points, drift) => {
        const out = [];
        const vol = Math.max(0.003, Math.min(0.025, Math.abs(changePercent) / 100 + 0.006));
        // Walk backward from currentPrice toward a start price implied by `drift`
        const startPrice = currentPrice / (1 + drift / 100);
        out.push(startPrice);
        for (let i = 1; i < points - 1; i++) {
            const trendStep = (currentPrice - startPrice) / points;
            const noise = (Math.random() - 0.5) * 2 * vol * startPrice;
            out.push(out[i - 1] + trendStep + noise);
        }
        out.push(currentPrice);
        return out;
    };

    return {
        '1D':  series(30, changePercent),
        '1W':  series(40, changePercent * 1.2),
        '1M':  series(50, changePercent * 2.0),
        'ALL': series(60, changePercent * 3.5)
    };
}

// ---------- TICKER ----------
function updateTickerTape(data) {
    const ticker = document.getElementById('global-ticker');
    if (!ticker) return;
    const majors = data.filter(item => TICKER_FAVS.includes(item.symbol));
    if (!majors.length) return;

    // Duplicate the set twice so the CSS translate(-50%) yields a seamless loop
    ticker.innerHTML = [...majors, ...majors].map(item => `
        <div class="ticker-item" data-symbol="${item.symbol}">
            <span class="ticker-symbol">${item.symbol}</span>
            <span class="ticker-price ${item.change >= 0 ? 'success' : 'danger'}">
                $${formatPrice(item.price)}
                <i class="ph ph-trend-${item.change >= 0 ? 'up' : 'down'}"></i>
            </span>
        </div>
    `).join('');
}

// Gentle inter-poll jitter so prices never look frozen
function startTickerJitter() {
    clearInterval(jitterTimer);
    jitterTimer = setInterval(() => {
        const items = document.querySelectorAll('.ticker-item');
        items.forEach(it => {
            const sym = it.dataset.symbol;
            const priceEl = it.querySelector('.ticker-price');
            const asset = marketData.find(m => m.symbol === sym);
            if (!asset || !priceEl) return;
            const jitter = 1 + (Math.random() - 0.5) * 0.0004; // ±0.02%
            const p = asset.price * jitter;
            priceEl.firstChild.nodeValue = `$${formatPrice(p)} `;
        });
    }, 3000);
}

// ---------- MARKET TABLES ----------
function renderMarketSection(tbodyElement, type, limit = null) {
    if (!tbodyElement) return;
    let filtered = marketData.filter(item => item.type === type);
    if (limit) filtered = filtered.slice(0, limit);

    tbodyElement.innerHTML = '';
    filtered.forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = 'fade-in';
        row.style.animationDelay = `${Math.min(index * 0.03, 0.5)}s`;
        row.addEventListener('click', () => openAssetModal(item.symbol));
        row.innerHTML = `
            <td>
                <div class="asset-cell">
                    ${item.image
                        ? `<img src="${item.image}" alt="${item.symbol}" class="asset-icon-img">`
                        : `<div class="asset-icon">${(item.symbol || '?')[0]}</div>`}
                    <div>
                        <div>${item.symbol}</div>
                        <div style="font-size:12px;color:var(--text-secondary)">${item.name}</div>
                    </div>
                </div>
            </td>
            <td style="font-weight:600">$${formatPrice(item.price)}</td>
            <td style="color:var(--text-secondary)">$${formatPrice(item.high)}</td>
            <td style="color:var(--text-secondary)">$${formatPrice(item.low)}</td>
            <td class="${item.change >= 0 ? 'positive' : 'negative'}">
                ${item.change >= 0 ? '↗' : '↘'} ${item.change.toFixed(2)}%
            </td>
            <td><div class="sparkline-container">${generateSparklineSVG(item.hist['1W'], item.recommendation, item.recText)}</div></td>
            <td><button class="btn-sm-action">Details</button></td>
        `;
        tbodyElement.appendChild(row);
    });
}

// ---------- DASHBOARD WIDGETS ----------
function renderTopPicks() {
    const container = document.getElementById('top-picks-container');
    if (!container) return;
    container.innerHTML = '';
    topPicks.forEach(pick => {
        const liveAsset = marketData.find(m => m.symbol === pick.symbol);
        const price = liveAsset ? liveAsset.price : pick.price;
        const hist = liveAsset ? liveAsset.hist['1W'] : generateRandomWalkHistory(price, 2)['1W'];

        const card = document.createElement('div');
        card.className = 'pick-card fade-in';
        card.style.background = pick.gradient;
        card.innerHTML = `
            <div class="pick-header">
                <span class="pick-symbol">${pick.symbol}</span>
                <span class="rec-badge rec-mini">AI FAVORITE</span>
            </div>
            <div class="pick-price">$${formatPrice(price)}</div>
            <div class="pick-spark">${generateSparklineSVG(hist, null, null)}</div>
            <div class="pick-reason">${pick.reason}</div>
        `;
        card.addEventListener('click', () => openAssetModal(pick.symbol));
        container.appendChild(card);
    });
}

function renderMovers() {
    const moversContainer = document.getElementById('top-movers-container');
    const valueContainer  = document.getElementById('deep-value-container');
    if (!moversContainer && !valueContainer) return;

    if (moversContainer) {
        const gainers = [...marketData].sort((a, b) => b.change - a.change).slice(0, 5);
        moversContainer.innerHTML = gainers.map(item => `
            <div class="movers-row" data-symbol="${item.symbol}">
                <div class="movers-left">
                    <span class="movers-sym">${item.symbol}</span>
                    <span class="movers-name">${item.name}</span>
                </div>
                <span class="positive movers-chg">+${item.change.toFixed(2)}%</span>
            </div>
        `).join('');
        moversContainer.querySelectorAll('.movers-row').forEach(r => {
            r.addEventListener('click', () => openAssetModal(r.dataset.symbol));
        });
    }

    if (valueContainer) {
        const deepValue = marketData.filter(item => item.price > 0 && item.price < 50 && item.type !== 'index')
                                    .sort((a, b) => b.change - a.change).slice(0, 5);
        valueContainer.innerHTML = deepValue.map(item => `
            <div class="movers-row" data-symbol="${item.symbol}">
                <div class="movers-left">
                    <span class="movers-sym">${item.symbol}</span>
                    <span class="movers-name">$${formatPrice(item.price)}</span>
                </div>
                <span class="${item.change >= 0 ? 'positive' : 'negative'} movers-chg">
                    ${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%
                </span>
            </div>
        `).join('');
        valueContainer.querySelectorAll('.movers-row').forEach(r => {
            r.addEventListener('click', () => openAssetModal(r.dataset.symbol));
        });
    }
}

// ---------- NEWS ----------
async function renderNews() {
    const container = document.getElementById('news-container');
    if (!container) return;
    let items = [];
    try {
        const res = await fetch('/api/news');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) items = data.slice(0, 6);
        }
    } catch (_) { /* fall through to fallback */ }

    if (!items.length) {
        container.innerHTML = newsFallback.map(n => `
            <a class="news-card" href="#" onclick="return false;">
                <div class="news-source">
                    <span class="source-name">NexGen Wire</span>
                    <span class="news-time">Just now</span>
                </div>
                <div class="news-title">${n.title}</div>
                <div class="news-meta">
                    <span class="news-impact ${n.type}">
                        <i class="ph ${n.icon}"></i> ${n.type === 'positive' ? 'Bullish' : n.type === 'negative' ? 'Bearish' : 'Neutral'}
                    </span>
                </div>
            </a>
        `).join('');
        return;
    }

    container.innerHTML = items.map(n => {
        const host = (() => { try { return new URL(n.link).host.replace('www.', ''); } catch (_) { return 'news'; } })();
        const when = n.pubDate ? timeAgo(new Date(n.pubDate)) : 'recent';
        return `
            <a class="news-card" href="${n.link || '#'}" target="_blank" rel="noopener noreferrer">
                <div class="news-source">
                    <span class="source-name">${host}</span>
                    <span class="news-time">${when}</span>
                </div>
                <div class="news-title">${n.title}</div>
                <div class="news-meta">
                    <span class="news-impact neutral">
                        <i class="ph ph-newspaper"></i> Market Wire
                    </span>
                </div>
            </a>
        `;
    }).join('');
}

function timeAgo(date) {
    if (isNaN(date.getTime())) return 'recent';
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

// ---------- NEWS TOAST ----------
function triggerNewsAlert() {
    const container = document.getElementById('news-toast-container');
    if (!container) return;
    const news = newsFallback[Math.floor(Math.random() * newsFallback.length)];
    const toast = document.createElement('div');
    toast.className = 'news-toast';
    const duration = 6000;
    toast.innerHTML = `
        <i class="ph ${news.icon} news-icon ${news.type}"></i>
        <div class="news-content">
            <div class="news-header">
                <span class="news-title">${news.title}</span>
                <span class="news-time">Just now</span>
            </div>
            <div class="news-desc">${news.desc}</div>
        </div>
        <div class="news-progress ${news.type}" style="animation-duration: ${duration}ms;"></div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 400);
    }, duration);
}

function initNewsAlerts() {
    setTimeout(triggerNewsAlert, 7000);
    setInterval(triggerNewsAlert, Math.floor(Math.random() * 20000) + 40000);
}

// ---------- SPARKLINE SVG ----------
function generateSparklineSVG(data, recommendation = null, recText = null) {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;
    const isPositive = data[data.length - 1] >= data[0];
    const colorHex = isPositive ? '#8A9A5B' : '#C55A44';

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 30 - ((val - min) / range) * 22 - 4;
        return { x, y };
    });

    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const cp1x = p1.x + (p2.x - p1.x) / 3;
        const cp2x = p2.x - (p2.x - p1.x) / 3;
        d += ` C ${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`;
    }

    const gradientId = `spark-grad-${Math.random().toString(36).substring(2, 8)}`;
    const lastPoint = points[points.length - 1];

    return `
        <svg class="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
            <defs>
                <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%"  stop-color="${colorHex}" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="${colorHex}" stop-opacity="0.0"/>
                </linearGradient>
            </defs>
            <path d="${d} L 100,30 L 0,30 Z" fill="url(#${gradientId})" style="opacity:0; animation: fade-in 0.8s ease 0.3s forwards;" />
            <path class="sparkline-path" d="${d}" fill="none" stroke="${colorHex}" stroke-width="2" stroke-linecap="round"
                  style="filter: drop-shadow(0 2px 4px ${colorHex}44); stroke-dasharray:400; stroke-dashoffset:400; animation: draw-sparkline 1.2s ease-out forwards;" />
            <circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="1.5" fill="${colorHex}" class="sparkline-dot" style="opacity:0; animation: fade-in 0.3s ease 1.0s forwards;" />
        </svg>
        ${recommendation ? `<span class="floating-status-badge ${recommendation}">${recText}</span>` : ''}
    `;
}

// ---------- FORMATTERS ----------
function formatLargeNumber(num) {
    if (!num || isNaN(num)) return 'N/A';
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9)  return '$' + (num / 1e9).toFixed(2)  + 'B';
    if (num >= 1e6)  return '$' + (num / 1e6).toFixed(2)  + 'M';
    if (num >= 1e3)  return '$' + (num / 1e3).toFixed(2)  + 'K';
    return '$' + num.toLocaleString();
}

function formatPrice(p) {
    if (p == null || isNaN(p)) return '0.00';
    if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toFixed(2);
    return p.toFixed(4);
}

// ---------- NAV & MODALS ----------
function openAssetModal(symbol) {
    if (!symbol) return;
    window.location.href = `details.html?symbol=${encodeURIComponent(symbol)}`;
}

function setLiveIndicator(active) {
    const pulse = document.getElementById('live-pulse');
    if (pulse) pulse.classList.toggle('syncing', !!active);
}

// ---------- PORTFOLIO ----------
function updateTotalBalance() {
    if (!totalBalanceEl) return;
    const holdingsTotal = manualHoldings.reduce((sum, item) => {
        const liveAsset = marketData.find(m => m.symbol === item.ticker);
        const currentPrice = liveAsset ? liveAsset.price : item.price;
        return sum + (item.qty * currentPrice);
    }, 0);
    const cash = cashInput ? (parseFloat(cashInput.value) || 0) : 0;
    const oldBalance = parseFloat((totalBalanceEl.textContent || '').replace(/[$,]/g, '')) || 0;
    animateValue(totalBalanceEl, oldBalance, holdingsTotal + cash, 900);
}

function renderHoldings() {
    if (!holdingsList) return;
    if (!manualHoldings.length) {
        holdingsList.innerHTML = `<li class="holdings-empty">No holdings yet. Use the AI concierge or connect a provider to sync.</li>`;
        return;
    }
    holdingsList.innerHTML = manualHoldings.map((item, index) => {
        const liveAsset = marketData.find(m => m.symbol === item.ticker);
        const livePrice = liveAsset ? liveAsset.price : item.price;
        const pnl = ((livePrice - item.price) / item.price) * 100;
        const pnlClass = pnl >= 0 ? 'positive' : 'negative';
        return `
            <li class="holding-item">
                <div class="holding-details">
                    <span class="holding-ticker">${item.ticker}</span>
                    <span class="holding-meta">${item.qty} @ $${formatPrice(item.price)} <span class="${pnlClass}">(${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%)</span></span>
                </div>
                <div class="holding-value">$${formatPrice(item.qty * livePrice)}</div>
                <button class="remove-btn" data-idx="${index}" aria-label="Remove"><i class="ph ph-trash"></i></button>
            </li>
        `;
    }).join('');
    holdingsList.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            if (!isNaN(idx)) removeHolding(idx);
        });
    });
}

function removeHolding(index) {
    manualHoldings.splice(index, 1);
    saveHoldings();
    renderHoldings();
    updateTotalBalance();
}

function addHolding({ ticker, qty, price, date }) {
    if (!ticker || !qty) return false;
    const live = marketData.find(m => m.symbol === String(ticker).toUpperCase());
    const finalPrice = parseFloat(price) || (live ? live.price : 0);
    manualHoldings.push({
        ticker: String(ticker).toUpperCase(),
        qty: parseFloat(qty),
        price: finalPrice,
        date: date || new Date().toISOString().slice(0, 10)
    });
    saveHoldings();
    renderHoldings();
    updateTotalBalance();
    return true;
}

// ---------- STRATEGY ANALYSIS ----------
function handleAnalysis() {
    if (!analysisOutput) return;
    const cash = parseFloat(cashInput?.value) || 0;
    if (strategyStatus) { strategyStatus.textContent = 'Processing…'; strategyStatus.className = 'badge processing'; }
    setTimeout(() => generateRecommendation(cash), 800);
}

function generateRecommendation(cash) {
    if (strategyStatus) { strategyStatus.textContent = 'Ready'; strategyStatus.className = 'badge ready'; }

    const sectors = { crypto: 0, equity: 0, index: 0, commodity: 0, other: 0 };
    manualHoldings.forEach(h => {
        const asset = marketData.find(m => m.symbol === h.ticker);
        const val = h.qty * (asset ? asset.price : h.price);
        if (!asset) { sectors.other += val; return; }
        if (asset.type === 'megacap' || asset.type === 'smallcap') sectors.equity += val;
        else if (asset.type === 'crypto')    sectors.crypto    += val;
        else if (asset.type === 'index')     sectors.index     += val;
        else if (asset.type === 'commodity') sectors.commodity += val;
        else                                 sectors.other     += val;
    });
    const totalInvested = Object.values(sectors).reduce((a, b) => a + b, 0);
    const total = totalInvested + cash;

    if (total <= 0) {
        analysisOutput.innerHTML = `
            <div class="empty-analysis-icon"><i class="ph ph-strategy"></i></div>
            <div><h4>Add holdings or capital to begin</h4><p class="placeholder-text">The concierge needs at least one position or some investment capital.</p></div>`;
        return;
    }

    const pct = (x) => ((x / total) * 100).toFixed(0);
    const advice = [];
    if (sectors.crypto / total > 0.5) advice.push('Your crypto exposure is heavy — consider rebalancing into indices or megacaps for stability.');
    if (sectors.equity / total < 0.2 && sectors.crypto > 0) advice.push('Low equity allocation. A broad index ETF (VWCE, IWDA, SPY) can anchor volatility.');
    if (cash / total > 0.4) advice.push('Significant uninvested cash. Dollar-cost averaging over 3–6 months reduces timing risk.');
    if (!advice.length) advice.push('Allocation looks balanced. Continue dollar-cost averaging and review quarterly.');

    analysisOutput.innerHTML = `
        <div class="strategy-block">
            <h4><i class="ph ph-strategy"></i> Allocation Overview</h4>
            <div class="allocation-bars">
                ${['crypto','equity','index','commodity','other'].filter(k => sectors[k] > 0).map(k => `
                    <div class="alloc-row">
                        <span class="alloc-label">${k}</span>
                        <div class="alloc-bar"><div class="alloc-fill alloc-${k}" style="width:${pct(sectors[k])}%"></div></div>
                        <span class="alloc-pct">${pct(sectors[k])}%</span>
                    </div>`).join('')}
                ${cash > 0 ? `
                    <div class="alloc-row">
                        <span class="alloc-label">cash</span>
                        <div class="alloc-bar"><div class="alloc-fill alloc-cash" style="width:${pct(cash)}%"></div></div>
                        <span class="alloc-pct">${pct(cash)}%</span>
                    </div>` : ''}
            </div>
        </div>
        <div class="strategy-block">
            <h4><i class="ph ph-sparkle"></i> Expert Guidance</h4>
            <ul class="advice-list">${advice.map(a => `<li>${a}</li>`).join('')}</ul>
        </div>
        <div class="advisor-block">
            <span class="gauge-label">Overall Score</span>
            <p class="advisor-text">Total portfolio value: <strong>$${formatPrice(total)}</strong>. Diversification score reflects exposure across ${Object.values(sectors).filter(v => v > 0).length} asset classes.</p>
        </div>
    `;
}

// ---------- MESSY NATURAL-LANGUAGE PARSER ----------
// Maps common names, misspellings, and tickers
const COMPANY_TICKER_MAP = {
    // Mega caps
    'tesla': 'TSLA', 'tsla': 'TSLA',
    'apple': 'AAPL', 'aapl': 'AAPL',
    'nvidia': 'NVDA', 'nvda': 'NVDA',
    'amazon': 'AMZN', 'amzn': 'AMZN',
    'microsoft': 'MSFT', 'msft': 'MSFT',
    'meta': 'META', 'facebook': 'META',
    'google': 'GOOGL', 'googl': 'GOOGL', 'alphabet': 'GOOGL',
    'netflix': 'NFLX', 'nflx': 'NFLX',
    'disney': 'DIS',
    'jpmorgan': 'JPM', 'jp morgan': 'JPM', 'jpm': 'JPM',
    'berkshire': 'BRK-B',
    'visa': 'V', 'mastercard': 'MA',
    'walmart': 'WMT',
    'coca-cola': 'KO', 'coca cola': 'KO', 'coke': 'KO',
    'pepsi': 'PEP',
    'johnson': 'JNJ',
    'exxon': 'XOM', 'chevron': 'CVX',
    'broadcom': 'AVGO', 'avgo': 'AVGO',
    // Small/growth
    'palantir': 'PLTR', 'pltr': 'PLTR',
    'rocket lab': 'RKLB', 'rocketlab': 'RKLB', 'rklb': 'RKLB',
    'ast spacemobile': 'ASTS', 'asts': 'ASTS',
    'sofi': 'SOFI',
    'ionq': 'IONQ',
    'joby': 'JOBY',
    'microstrategy': 'MSTR', 'mstr': 'MSTR',
    'hims': 'HIMS',
    'supermicro': 'SMCI', 'smci': 'SMCI',
    'reddit': 'RDDT', 'rddt': 'RDDT',
    'arm': 'ARM',
    'amd': 'AMD',
    'intel': 'INTC',
    'coinbase': 'COIN',
    'robinhood': 'HOOD',
    // Crypto
    'bitcoin': 'BTC', 'btc': 'BTC',
    'ethereum': 'ETH', 'eth': 'ETH', 'ether': 'ETH',
    'solana': 'SOL', 'sol': 'SOL',
    'cardano': 'ADA', 'ada': 'ADA',
    'dogecoin': 'DOGE', 'doge': 'DOGE',
    'ripple': 'XRP', 'xrp': 'XRP',
    'polkadot': 'DOT',
    'chainlink': 'LINK',
    'avalanche': 'AVAX', 'avax': 'AVAX',
    'binance coin': 'BNB', 'bnb': 'BNB',
    'tether': 'USDT', 'usd coin': 'USDC',
    'litecoin': 'LTC',
    // Indices / ETFs
    'spy': 'SPY', 'sp500': 'SPY', 's&p 500': 'SPY', 's&p500': 'SPY',
    'qqq': 'QQQ', 'nasdaq': 'QQQ',
    'vwce': 'VWCE', 'iwda': 'IWDA', 'voo': 'VOO',
    // International
    'iag': 'IAG.L', 'iberia': 'IAG.MC', 'british airways': 'IAG.L', 'aena': 'AENA.MC', 'inditex': 'ITX.MC',
    'santander': 'SAN.MC', 'bbva': 'BBVA.MC', 'iberdrola': 'IBE.MC', 'repsol': 'REP.MC', 'telefonica': 'TEF.MC',
    'lufthansa': 'LHA.DE', 'air france': 'AF.PA', 'ryanair': 'RYAAY', 'easyjet': 'EZJ.L'
};

const MONTH_NAMES = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

function padNum(n) { return String(n).padStart(2, '0'); }

function parseDateLoose(t) {
    // ISO
    let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return `${m[1]}-${padNum(m[2])}-${padNum(m[3])}`;

    // "24 april 2024" or "24th april 2024"
    m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\s*,?\s*(\d{2,4})?/i);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = MONTH_NAMES[m[2].toLowerCase().slice(0, 4)] || MONTH_NAMES[m[2].toLowerCase().slice(0, 3)];
        let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
        if (year < 100) year += 2000;
        return `${year}-${padNum(month)}-${padNum(day)}`;
    }

    // "april 24 2024"
    m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{2,4})?/i);
    if (m) {
        const month = MONTH_NAMES[m[1].toLowerCase().slice(0, 4)] || MONTH_NAMES[m[1].toLowerCase().slice(0, 3)];
        const day = parseInt(m[2], 10);
        let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
        if (year < 100) year += 2000;
        return `${year}-${padNum(month)}-${padNum(day)}`;
    }

    // Slash-separated — assume first > 12 means DD/MM, otherwise MM/DD
    m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (m) {
        let a = parseInt(m[1], 10);
        let b = parseInt(m[2], 10);
        let year = parseInt(m[3], 10);
        if (year < 100) year += 2000;
        let day, month;
        if (a > 12)       { day = a; month = b; }
        else if (b > 12)  { month = a; day = b; }
        else              { month = a; day = b; } // default US
        return `${year}-${padNum(month)}-${padNum(day)}`;
    }

    // Relative
    const today = new Date();
    if (/\btoday\b/.test(t))     return `${today.getFullYear()}-${padNum(today.getMonth() + 1)}-${padNum(today.getDate())}`;
    if (/\byesterday\b/.test(t)) { const d = new Date(today.getTime() - 86400000); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`; }
    if (/last\s+week/.test(t))   { const d = new Date(today.getTime() - 7 * 86400000); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`; }
    if (/last\s+month/.test(t))  { const d = new Date(today.getTime() - 30 * 86400000); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`; }
    if (/last\s+year/.test(t))   { return `${today.getFullYear() - 1}-01-15`; }

    return null;
}

function findTickerInText(text) {
    const t = ' ' + text.toLowerCase() + ' ';
    // Longest-first match to avoid "sol" matching inside "solana"
    const sorted = Object.keys(COMPANY_TICKER_MAP).sort((a, b) => b.length - a.length);
    for (const name of sorted) {
        const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('[^a-z0-9]' + safe + '[^a-z0-9]');
        if (re.test(t)) return COMPANY_TICKER_MAP[name];
    }
    // Fallback: bare uppercase 2-5 letter tickers in the original text
    const m = text.match(/\b([A-Z]{2,5})\b/);
    if (m && m[1] !== 'USD' && m[1] !== 'AT') return m[1];
    return null;
}

function parseAmountLoose(text) {
    // "$1,000.50" | "1000 dollars" | "1000dolars" | "1.5k" | "1000 bucks" | "1000 usd"
    const t = text.toLowerCase();
    let m = t.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
    m = t.match(/([\d,]+(?:\.\d+)?)\s*(?:dolars?|dollars?|bucks?|usd)\b/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
    m = t.match(/\b([\d.]+)\s*k\b/);
    if (m) return parseFloat(m[1]) * 1000;
    return null;
}

function parseQuantityLoose(text, ticker) {
    if (!ticker) return null;
    const t = text.toLowerCase();
    // Build alias group: ticker + every name that maps to it in COMPANY_TICKER_MAP
    const aliases = Object.keys(COMPANY_TICKER_MAP).filter(k => COMPANY_TICKER_MAP[k] === ticker);
    aliases.push(ticker.toLowerCase());
    const aliasGroup = aliases
        .map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .sort((a, b) => b.length - a.length)
        .join('|');
    // "5 tesla", "10 shares of nvda", "0.5 btc"
    const near = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:shares?|units?|coins?|of\\s+)?\\s*(?:${aliasGroup})\\b`));
    if (near) return parseFloat(near[1]);
    // "bought 10 shares" — explicit unit required so "got 1000 dollars" doesn't hijack
    const bought = t.match(/\b(?:bought|got|have|own)\s+(\d+(?:\.\d+)?)\s+(?:shares?|units?|coins?)\b/);
    if (bought) return parseFloat(bought[1]);
    return null;
}

function parsePriceLoose(text) {
    const t = text.toLowerCase();
    // "at $120", "@ 120", "for $120"
    const m = t.match(/(?:at|@|for)\s*\$?\s*([\d,]+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
    return null;
}

function localParsePurchase(text) {
    const ticker = findTickerInText(text);
    if (!ticker) return null;

    const date = parseDateLoose(text);
    const amountUsd = parseAmountLoose(text);
    const qty = parseQuantityLoose(text, ticker);
    const price = parsePriceLoose(text);

    // Priority 1: explicit qty + price → "I bought 10 NVDA at $120"
    if (qty && price) {
        return { kind: 'now', ticker, qty, price, date: date || new Date().toISOString().slice(0, 10) };
    }
    // Priority 2: dollar-amount purchase → "$1000 in TSLA on 2024-04-24"
    if (amountUsd && date) {
        return { kind: 'historical', ticker, amount_usd: amountUsd, date };
    }
    // Priority 3: dollar amount without date → assume today
    if (amountUsd) {
        const today = new Date().toISOString().slice(0, 10);
        return { kind: 'historical', ticker, amount_usd: amountUsd, date: today };
    }
    // Priority 4: qty alone → use current market price
    if (qty) {
        return { kind: 'now_live', ticker, qty, date: date || new Date().toISOString().slice(0, 10) };
    }
    return null;
}

// ---------- HISTORICAL PRICE ----------
async function fetchHistoricalPrice(symbol, dateISO) {
    try {
        const res = await fetch(`/api/historical?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(dateISO)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data;
    } catch (err) {
        console.error('Historical fetch failed:', err);
        return null;
    }
}

async function executeHistoricalAdd({ ticker, amount_usd, date }) {
    const hist = await fetchHistoricalPrice(ticker, date);
    if (!hist || !hist.price) {
        return { ok: false, error: `Couldn't find a historical price for ${ticker} on ${date}.` };
    }
    const qty = amount_usd / hist.price;
    addHolding({ ticker, qty, price: hist.price, date: hist.date_resolved || date });

    const live = marketData.find(m => m.symbol === String(ticker).toUpperCase());
    const currentPrice = live ? live.price : hist.price;
    const currentValue = qty * currentPrice;
    const pnl = currentValue - amount_usd;
    const pnlPct = (pnl / amount_usd) * 100;
    return {
        ok: true,
        ticker: String(ticker).toUpperCase(),
        qty, amount_usd,
        histPrice: hist.price,
        histDate: hist.date_resolved || date,
        currentPrice, currentValue, pnl, pnlPct
    };
}

// ---------- OPPORTUNITIES ENGINE ----------
function computeOpportunities() {
    const candidates = marketData.filter(m => {
        const chg = m.change || 0;
        if (chg <= 0.2 || chg > 10) return false;    // positive but not reckless
        if (!m.price || m.price <= 0) return false;
        if (m.type === 'index') return false;          // skip index wrappers
        return true;
    });

    const scored = candidates.map(m => {
        const chg = m.change;
        let stability = 1;
        if (chg > 3) stability = 0.75;
        if (chg > 5) stability = 0.5;
        if (chg > 7) stability = 0.25;
        let capFactor = 1;
        if (m.type === 'smallcap')  capFactor = 0.65;
        if (m.type === 'commodity') capFactor = 0.85;
        const score = chg * stability * capFactor;

        let reason = 'steady momentum';
        if (chg > 4 && m.type === 'megacap') reason = 'megacap breakout';
        else if (m.type === 'crypto' && chg > 2 && chg < 5) reason = 'crypto with safe momentum';
        else if (m.type === 'megacap' && chg < 2)        reason = 'defensive megacap';
        else if (m.type === 'commodity')                  reason = 'commodity hedge';
        else if (m.type === 'smallcap' && chg < 4)        reason = 'small-cap on the move';

        return { ...m, score, reason };
    });

    scored.sort((a, b) => b.score - a.score);
    // Ensure class diversity in top slots
    const seen = new Set();
    const diverse = [];
    for (const s of scored) {
        const key = s.type;
        if (diverse.length < 4 && (diverse.filter(d => d.type === key).length < 2)) {
            diverse.push(s); seen.add(key);
        }
        if (diverse.length === 4) break;
    }
    return diverse.length ? diverse : scored.slice(0, 4);
}

// ---------- RICH CHAT CARDS ----------
function appendOpportunitiesCard(messagesContainer) {
    if (!messagesContainer) return;
    const picks = computeOpportunities();

    if (!picks.length) {
        appendAIMessage(messagesContainer, 'Still syncing today\'s market. I\'ll surface opportunities as soon as data lands.');
        return;
    }

    const html = `
        <div class="chat-message ai-message fade-in">
            <div class="message-bubble opp-card">
                <div class="opp-head">
                    <div class="opp-head-icon"><i class="ph ph-sparkle"></i></div>
                    <div>
                        <div class="opp-head-title">Today's best opportunities</div>
                        <div class="opp-head-sub">Ranked by momentum × stability</div>
                    </div>
                </div>
                <div class="opp-list">
                    ${picks.map(p => `
                        <div class="opp-row" data-symbol="${p.symbol}">
                            <div class="opp-left">
                                <span class="opp-sym">${p.symbol}</span>
                                <span class="opp-reason">${p.reason}</span>
                            </div>
                            <div class="opp-right">
                                <span class="opp-price">$${formatPrice(p.price)}</span>
                                <span class="positive opp-chg">+${p.change.toFixed(2)}%</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="opp-foot">Not financial advice · click any row for details</div>
            </div>
        </div>`;
    messagesContainer.insertAdjacentHTML('beforeend', html);
    messagesContainer.querySelectorAll('.opp-row').forEach(el => {
        el.addEventListener('click', () => openAssetModal(el.dataset.symbol));
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendPositionCard(messagesContainer, data) {
    if (!messagesContainer || !data || !data.ok) return;
    const isUp = data.pnl >= 0;
    const html = `
        <div class="chat-message ai-message fade-in">
            <div class="message-bubble pos-card">
                <div class="pos-head">
                    <div class="pos-ticker-wrap">
                        <div class="pos-ticker-icon">${data.ticker[0]}</div>
                        <div>
                            <div class="pos-ticker">${data.ticker}</div>
                            <div class="pos-sub">Purchased ${data.histDate}</div>
                        </div>
                    </div>
                    <span class="pos-badge ${isUp ? 'positive' : 'negative'}">
                        ${isUp ? '+' : ''}${data.pnlPct.toFixed(2)}%
                    </span>
                </div>
                <div class="pos-value">$${formatPrice(data.currentValue)}</div>
                <div class="pos-pnl ${isUp ? 'positive' : 'negative'}">
                    <i class="ph ph-trend-${isUp ? 'up' : 'down'}"></i>
                    ${isUp ? '+' : '-'}$${formatPrice(Math.abs(data.pnl))} ${isUp ? 'in profit' : 'in loss'}
                </div>
                <div class="pos-grid">
                    <div class="pos-cell"><span>Invested</span><strong>$${formatPrice(data.amount_usd)}</strong></div>
                    <div class="pos-cell"><span>Buy price</span><strong>$${formatPrice(data.histPrice)}</strong></div>
                    <div class="pos-cell"><span>Now</span><strong>$${formatPrice(data.currentPrice)}</strong></div>
                    <div class="pos-cell"><span>Shares</span><strong>${data.qty.toFixed(4)}</strong></div>
                </div>
                <div class="pos-foot">
                    <i class="ph ph-check-circle"></i> Synced to your portfolio
                </div>
            </div>
        </div>`;
    messagesContainer.insertAdjacentHTML('beforeend', html);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendAIMessage(messagesContainer, text) {
    if (!messagesContainer) return;
    const div = document.createElement('div');
    div.className = 'chat-message ai-message fade-in';
    div.innerHTML = `<div class="message-bubble">${text}</div>`;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendUserMessage(messagesContainer, text) {
    if (!messagesContainer) return;
    const div = document.createElement('div');
    div.className = 'chat-message user-message fade-in';
    div.innerHTML = `<div class="message-bubble">${escapeHTML(text)}</div>`;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ---------- FLOATING AI CHAT ----------
let aiWelcomeShown = false;

function initAIAssistant() {
    const aiToggle   = document.getElementById('ai-chat-toggle');
    const aiWindow   = document.getElementById('ai-chat-window');
    const aiClose    = document.getElementById('ai-chat-close');
    const aiMessages = document.getElementById('ai-chat-messages');
    const aiInput    = document.getElementById('ai-chat-input');
    const aiSend     = document.getElementById('ai-chat-send');
    if (!aiInput || !aiSend || !aiMessages) return;

    // Remove the hard-coded greeting so we can inject our own on open
    const seedGreeting = aiMessages.querySelector('.chat-message.ai-message');
    if (seedGreeting) seedGreeting.remove();

    const ensureWelcome = () => {
        // Refresh the opportunities card every open — prices change
        const existing = aiMessages.querySelector('.opp-card');
        if (existing) existing.closest('.chat-message')?.remove();
        if (!aiWelcomeShown) {
            appendAIMessage(aiMessages, `Hey — I can handle messy language. Try:<br><i style="color:var(--primary-accent)">"i got 1000 dollars in tesla that i bought 24 april 2024"</i>`);
            aiWelcomeShown = true;
        }
        appendOpportunitiesCard(aiMessages);
    };

    aiToggle?.addEventListener('click', () => {
        aiWindow.classList.toggle('hidden');
        if (!aiWindow.classList.contains('hidden')) {
            ensureWelcome();
            aiInput.focus();
        }
    });
    aiClose?.addEventListener('click', () => aiWindow.classList.add('hidden'));

    async function handleUserInput() {
        const text = aiInput.value.trim();
        if (!text) return;
        appendUserMessage(aiMessages, text);
        aiInput.value = '';

        // 1) Try local parser first — fast, no API needed
        const parsed = localParsePurchase(text);
        if (parsed) {
            await handleParsedPurchase(parsed, aiMessages);
            return;
        }

        // 2) Fall through to Claude/Gemini
        const typing = document.createElement('div');
        typing.className = 'chat-message ai-message fade-in';
        typing.innerHTML = `<div class="message-bubble"><div class="ai-typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>`;
        aiMessages.appendChild(typing);
        aiMessages.scrollTop = aiMessages.scrollHeight;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            const data = await response.json();
            typing.remove();

            if (data.text) appendAIMessage(aiMessages, escapeHTML(data.text));

            if (data.action) {
                await handleChatAction(data.action, aiMessages);
            }
        } catch (err) {
            typing.remove();
            appendAIMessage(aiMessages, `I can't reach the NexGen AI service right now. Check your <code>.env</code> keys and that <code>server.py</code> is running. (You can still type things like <i>"I bought 10 NVDA at $120"</i> — I parse those locally.)`);
            console.error('AI Chat Error:', err);
        }
    }

    aiSend.addEventListener('click', handleUserInput);
    aiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserInput(); });
}

async function handleParsedPurchase(parsed, messagesContainer) {
    if (parsed.kind === 'historical') {
        // Loading state card
        const loading = document.createElement('div');
        loading.className = 'chat-message ai-message fade-in';
        loading.innerHTML = `<div class="message-bubble"><i class="ph ph-spinner ph-spin"></i> Fetching ${parsed.ticker}'s price on ${parsed.date}…</div>`;
        messagesContainer.appendChild(loading);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        const result = await executeHistoricalAdd(parsed);
        loading.remove();

        if (!result.ok) {
            appendAIMessage(messagesContainer, result.error || 'Something went wrong fetching the historical price.');
            return;
        }
        appendPositionCard(messagesContainer, result);
        return;
    }
    if (parsed.kind === 'now') {
        addHolding({ ticker: parsed.ticker, qty: parsed.qty, price: parsed.price, date: parsed.date });
        const live = marketData.find(m => m.symbol === parsed.ticker);
        const currentPrice = live ? live.price : parsed.price;
        const currentValue = parsed.qty * currentPrice;
        const invested = parsed.qty * parsed.price;
        const pnl = currentValue - invested;
        const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
        appendPositionCard(messagesContainer, {
            ok: true,
            ticker: parsed.ticker,
            qty: parsed.qty,
            amount_usd: invested,
            histPrice: parsed.price,
            histDate: parsed.date,
            currentPrice, currentValue, pnl, pnlPct
        });
        return;
    }
    if (parsed.kind === 'now_live') {
        // Just qty — price defaults to current market
        const live = marketData.find(m => m.symbol === parsed.ticker);
        if (!live) {
            appendAIMessage(messagesContainer, `I don't have a live price for ${parsed.ticker} yet. Try telling me the price too, e.g. "${parsed.qty} ${parsed.ticker} at $120".`);
            return;
        }
        const price = live.price;
        addHolding({ ticker: parsed.ticker, qty: parsed.qty, price, date: parsed.date });
        appendPositionCard(messagesContainer, {
            ok: true,
            ticker: parsed.ticker,
            qty: parsed.qty,
            amount_usd: parsed.qty * price,
            histPrice: price,
            histDate: parsed.date,
            currentPrice: price,
            currentValue: parsed.qty * price,
            pnl: 0,
            pnlPct: 0
        });
        return;
    }
}

async function handleChatAction(action, messagesContainer) {
    const { type, payload = {} } = action || {};
    switch (type) {
        case 'ADD_HISTORICAL': {
            if (!payload.ticker || !payload.amount_usd || !payload.date) break;
            const result = await executeHistoricalAdd({
                ticker: payload.ticker,
                amount_usd: parseFloat(payload.amount_usd),
                date: payload.date
            });
            if (result.ok) appendPositionCard(messagesContainer, result);
            else appendAIMessage(messagesContainer, result.error || 'Historical fetch failed.');
            break;
        }
        case 'ADD_TO_PORTFOLIO': {
            if (!payload.ticker) break;
            const qty = parseFloat(payload.qty || 1);
            const live = marketData.find(m => m.symbol === String(payload.ticker).toUpperCase());
            const price = parseFloat(payload.price) || (live ? live.price : 0);
            addHolding({ ticker: payload.ticker, qty, price, date: 'AI sync' });
            const currentPrice = live ? live.price : price;
            const invested = qty * price;
            const pnl = (qty * currentPrice) - invested;
            appendPositionCard(messagesContainer, {
                ok: true,
                ticker: String(payload.ticker).toUpperCase(),
                qty, amount_usd: invested,
                histPrice: price, histDate: 'now',
                currentPrice, currentValue: qty * currentPrice,
                pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : 0
            });
            break;
        }
        case 'REMOVE_FROM_PORTFOLIO':
            if (payload.ticker) {
                manualHoldings = manualHoldings.filter(h => h.ticker !== String(payload.ticker).toUpperCase());
                saveHoldings(); renderHoldings(); updateTotalBalance();
                appendAIMessage(messagesContainer, `<span class="action-badge danger"><i class="ph ph-trash"></i> Removed ${escapeHTML(payload.ticker)}.</span>`);
            }
            break;
        case 'NAVIGATE': {
            const pages = { dashboard: 'index.html', markets: 'markets.html', portfolio: 'portfolio.html' };
            const page = pages[String(payload.target || '').toLowerCase()];
            if (page) window.location.href = page;
            break;
        }
        case 'SEARCH':
            if (payload.query) {
                const searchInput = document.getElementById('global-search-input');
                if (searchInput) {
                    searchInput.value = payload.query;
                    searchInput.dispatchEvent(new Event('input'));
                    searchInput.scrollIntoView({ behavior: 'smooth' });
                }
            }
            break;
        case 'SHOW_DETAILS':
            if (payload.symbol) openAssetModal(payload.symbol);
            break;
    }
}

// ---------- MAIN EVENT WIRING ----------
function setupEventListeners() {
    // Hero buttons (index only)
    document.getElementById('main-explore-btn')?.addEventListener('click', () => {
        const target = document.querySelector('.app-container');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('main-portfolio-btn')?.addEventListener('click', () => {
        window.location.href = 'portfolio.html';
    });

    // Connect-provider modal
    const connectBtn = document.getElementById('connect-wallet-btn');
    const modal = document.getElementById('connect-modal');
    const closeBtn = document.querySelector('.close-modal');
    if (connectBtn && modal) {
        connectBtn.addEventListener('click', () => modal.classList.remove('hidden'));
        closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); });
    }
    document.querySelectorAll('.provider-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const provider = btn.dataset.provider;
            const assets = providerAssets[provider];
            if (!assets) return;
            assets.forEach(a => addHolding(a));
            modal?.classList.add('hidden');
            // gentle toast
            const container = document.getElementById('news-toast-container');
            if (container) {
                const toast = document.createElement('div');
                toast.className = 'news-toast';
                toast.innerHTML = `
                    <i class="ph ph-check-circle news-icon positive"></i>
                    <div class="news-content">
                        <div class="news-header"><span class="news-title">Synced with ${provider}</span><span class="news-time">Just now</span></div>
                        <div class="news-desc">${assets.length} holdings added to your portfolio.</div>
                    </div>
                    <div class="news-progress positive" style="animation-duration: 5000ms;"></div>`;
                container.appendChild(toast);
                setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 400); }, 5000);
            }
        });
    });

    // Global search (dropdown)
    const searchInput = document.getElementById('global-search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    const searchResultsList = document.getElementById('search-results-list');
    const searchCountEl = document.getElementById('search-count');

    if (searchInput && searchDropdown && searchResultsList) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (query.length < 1) { searchDropdown.classList.add('hidden'); return; }
            const filtered = marketData
                .filter(item => item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query))
                .slice(0, 10);
            if (searchCountEl) searchCountEl.textContent = `${filtered.length} found`;
            searchResultsList.innerHTML = filtered.map(item => `
                <li class="search-result-item" data-symbol="${item.symbol}">
                    <div class="search-result-info">
                        ${item.image
                            ? `<img src="${item.image}" alt="${item.symbol}" class="search-result-icon">`
                            : `<div class="search-result-icon">${item.symbol[0]}</div>`}
                        <div class="search-result-text">
                            <span class="search-result-symbol">${item.symbol}</span>
                            <span class="search-result-name">${item.name}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div class="search-result-price">$${formatPrice(item.price)}</div>
                        <span class="${item.change >= 0 ? 'positive' : 'negative'} search-result-change">
                            ${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%
                        </span>
                    </div>
                </li>
            `).join('');
            if (!filtered.length) {
                searchResultsList.innerHTML = `<li class="search-empty">No results.</li>`;
            }
            searchDropdown.classList.remove('hidden');
        });

        searchResultsList.addEventListener('click', (e) => {
            const li = e.target.closest('.search-result-item');
            if (li) openAssetModal(li.dataset.symbol);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#global-search-container')) searchDropdown.classList.add('hidden');
        });
    }

    // Portfolio page inputs
    analyzeBtn?.addEventListener('click', handleAnalysis);
    cashInput?.addEventListener('input', updateTotalBalance);

    initScrollAnimations();
}

function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.bento-item, .market-table-section, .fade-in-up, .scroll-reveal').forEach(el => observer.observe(el));
}

// ---------- VALUE ANIMATION ----------
function animateValue(el, start, end, duration) {
    let startTs = null;
    const step = (ts) => {
        if (!startTs) startTs = ts;
        const progress = Math.min((ts - startTs) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = start + (end - start) * eased;
        el.textContent = '$' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// ---------- PORTFOLIO-PAGE AI INPUT (separate from the floating chat) ----------
function initPortfolioAI() {
    const btn = document.getElementById('ai-parse-btn');
    const input = document.getElementById('ai-asset-input');
    const processing = document.getElementById('ai-processing-state');
    const preview = document.getElementById('ai-result-preview');
    const confirmBtn = document.getElementById('confirm-ai-asset-btn');
    if (!btn || !input) return;

    let pendingPayload = null;

    const run = async () => {
        const text = input.value.trim();
        if (!text) return;
        const parsed = localParsePurchase(text);
        if (!parsed) {
            alert('I couldn\'t parse that. Try: "I bought 10 NVDA at $120 today" or "$1000 in Tesla on 24 april 2024"');
            return;
        }

        processing?.classList.remove('hidden');
        preview?.classList.add('hidden');

        let previewPrice = parsed.price;
        let qty = parsed.qty;

        if (parsed.kind === 'historical') {
            const hist = await fetchHistoricalPrice(parsed.ticker, parsed.date);
            processing?.classList.add('hidden');
            if (!hist || !hist.price) {
                alert(`Couldn't find a historical price for ${parsed.ticker} on ${parsed.date}.`);
                return;
            }
            previewPrice = hist.price;
            qty = parsed.amount_usd / hist.price;
            pendingPayload = {
                ticker: parsed.ticker,
                qty,
                price: hist.price,
                date: hist.date_resolved || parsed.date
            };
        } else {
            processing?.classList.add('hidden');
            pendingPayload = {
                ticker: parsed.ticker,
                qty,
                price: previewPrice,
                date: parsed.date
            };
        }

        if (preview) {
            preview.classList.remove('hidden');
            document.getElementById('prev-asset').textContent = pendingPayload.ticker;
            document.getElementById('prev-qty').textContent = qty.toFixed(4);
            document.getElementById('prev-price').textContent = '$' + formatPrice(previewPrice);
            document.getElementById('prev-date').textContent = pendingPayload.date;
        }
    };

    btn.addEventListener('click', run);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') run(); });

    confirmBtn?.addEventListener('click', () => {
        if (!pendingPayload) return;
        addHolding(pendingPayload);
        preview?.classList.add('hidden');
        input.value = '';
        pendingPayload = null;
    });
}

function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- BOOT ----------
async function init() {
    // Resolve DOM handles now that DOMContentLoaded has fired
    cryptoTableBody    = document.getElementById('crypto-table-body');
    stockTableBody     = document.getElementById('stock-table-body');
    smallcapTableBody  = document.getElementById('smallcap-table-body');
    intlTableBody      = document.getElementById('intl-table-body');
    indexTableBody     = document.getElementById('index-table-body');
    commodityTableBody = document.getElementById('commodity-table-body');
    topPicksContainer  = document.getElementById('top-picks-container');
    totalBalanceEl     = document.getElementById('total-balance');
    cashInput          = document.getElementById('cash-input');
    holdingsList       = document.getElementById('holdings-list');
    strategyStatus     = document.getElementById('strategy-status');
    analysisOutput     = document.getElementById('analysis-output');
    analyzeBtn         = document.getElementById('analyze-btn');

    setupEventListeners();
    initAIAssistant();
    initPortfolioAI();

    // First paint: holdings & last-updated (pre-data)
    renderHoldings();
    updateTotalBalance();

    // Hydrate from localStorage for an instant-paint effect while live data loads
    try {
        const cached = JSON.parse(localStorage.getItem('nexgen_market_data') || '[]');
        if (Array.isArray(cached) && cached.length) {
            marketData = cached;
            updateTickerTape(marketData);
            renderMarketSection(cryptoTableBody,    'crypto', 12);
            renderMarketSection(stockTableBody,     'megacap');
            renderMarketSection(smallcapTableBody,  'smallcap');
            renderMarketSection(intlTableBody,      'international');
            renderMarketSection(indexTableBody,     'index');
            renderMarketSection(commodityTableBody, 'commodity');
            renderTopPicks();
            renderMovers();
        }
    } catch (_) {}

    // Live data
    await refreshData();
    renderNews();
    startTickerJitter();
    initNewsAlerts();

    // Periodic loops
    setInterval(refreshData, 60000);             // full refresh every 60s
    setInterval(updateLastUpdatedLabel, 1000);   // "last updated" counter
    setInterval(checkMarketStatus, 30000);       // market-hours status
}

document.addEventListener('DOMContentLoaded', init);
