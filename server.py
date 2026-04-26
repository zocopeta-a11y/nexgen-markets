import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import xml.etree.ElementTree as ET
import time
import hmac
import hashlib
import csv
import io
import os

PORT = int(os.environ.get('PORT', 8000))

# Global Cache for Crypto Data (prevent 429 Too Many Requests)
CRYPTO_CACHE = {'data': None, 'time': 0}
CACHE_DURATION = 300 # 5 minutes cache

class FinanceProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_path.query)

        # API Route: Live Stock Quotes
        if parsed_path.path == '/api/quote':
            symbols_list = query_params.get('symbols', [''])[0]
            if not symbols_list:
                self.send_error(400, "Missing symbols parameter")
                return
            
            yf_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            results = []
            for symbol in symbols_list.split(','):
                if not symbol: continue
                url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1d"
                req = urllib.request.Request(url, headers=yf_headers)
                try:
                    with urllib.request.urlopen(req, timeout=15) as response:
                        data = json.loads(response.read().decode('utf-8'))
                        if 'chart' in data and data['chart']['result']:
                            meta = data['chart']['result'][0]['meta']
                            
                            price = meta.get('regularMarketPrice', 0)
                            prev = meta.get('chartPreviousClose', price)
                            change_percent = ((price - prev) / prev * 100) if prev else 0
                            
                            results.append({
                                'symbol': meta.get('symbol', symbol),
                                'shortName': meta.get('shortName', symbol),
                                'longName': meta.get('longName', symbol),
                                'regularMarketPrice': price,
                                'regularMarketOpen': meta.get('regularMarketOpen', 0),
                                'regularMarketDayHigh': meta.get('regularMarketDayHigh', price),
                                'regularMarketDayLow': meta.get('regularMarketDayLow', price),
                                'regularMarketChange': price - prev,
                                'regularMarketChangePercent': change_percent,
                                'regularMarketVolume': meta.get('regularMarketVolume', 0),
                                'previousClose': prev,
                                'marketCap': meta.get('marketCap', 0),
                                'fiftyTwoWeekHigh': meta.get('fiftyTwoWeekHigh', 0),
                                'fiftyTwoWeekLow': meta.get('fiftyTwoWeekLow', 0),
                            })
                except Exception as e:
                    print(f"Skipping {symbol} due to error: {e}")
                    
            try:
                final_json = json.dumps({'quoteResponse': {'result': results}})
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(final_json.encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
                
        # API Route: Historical Chart Data
        elif parsed_path.path == '/api/chart':
            symbol = query_params.get('symbol', ['AAPL'])[0]
            rng = query_params.get('range', ['3mo'])[0]
            interval = query_params.get('interval', ['1d'])[0]

            # For max/all-time range, use period1/period2 so Yahoo Finance returns
            # the full history (range=max can be capped by Yahoo's free tier)
            if rng == 'max':
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1=0&period2={int(time.time())}&interval={interval}"
            else:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={rng}&interval={interval}"

            yf_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            req = urllib.request.Request(url, headers=yf_headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    data = response.read()
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_error(500, str(e))

        # API Route: Historical price on a specific date (for "$1000 in TSLA on 2024-04-24" flow)
        elif parsed_path.path == '/api/historical':
            symbol = query_params.get('symbol', [''])[0]
            date_str = query_params.get('date', [''])[0]
            if not symbol or not date_str:
                self.send_error(400, "Missing symbol or date parameter")
                return

            try:
                target_struct = time.strptime(date_str, '%Y-%m-%d')
                target_ts = int(time.mktime(target_struct))
            except ValueError:
                self.send_error(400, "Bad date format (expected YYYY-MM-DD)")
                return

            # Pick a Yahoo range that covers the target date
            days_ago = (time.time() - target_ts) / 86400.0
            if days_ago < 5:       rng = '1mo'
            elif days_ago < 30:    rng = '3mo'
            elif days_ago < 180:   rng = '6mo'
            elif days_ago < 365:   rng = '2y'
            elif days_ago < 5*365: rng = '5y'
            else:                  rng = 'max'

            # Crypto symbols need -USD suffix on Yahoo
            crypto_syms = {'BTC','ETH','SOL','USDT','BNB','XRP','USDC','ADA','DOGE','AVAX',
                           'LTC','DOT','LINK','MATIC','UNI','ATOM','NEAR','APT'}
            sym = f"{symbol.upper()}-USD" if symbol.upper() in crypto_syms else symbol

            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range={rng}&interval=1d"
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            })
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    result = data['chart']['result'][0]
                    timestamps = result.get('timestamp') or []
                    closes = result.get('indicators', {}).get('quote', [{}])[0].get('close', [])

                    best_idx = None
                    best_diff = float('inf')
                    for i, ts in enumerate(timestamps):
                        if i >= len(closes) or closes[i] is None:
                            continue
                        diff = abs(ts - target_ts)
                        if diff < best_diff:
                            best_diff = diff
                            best_idx = i

                    if best_idx is None:
                        self.send_error(404, "No historical data for that date")
                        return

                    resolved = time.strftime('%Y-%m-%d', time.gmtime(timestamps[best_idx]))
                    response_obj = {
                        'symbol': symbol.upper(),
                        'date_requested': date_str,
                        'date_resolved': resolved,
                        'price': closes[best_idx],
                        'currency': result.get('meta', {}).get('currency', 'USD')
                    }
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(response_obj).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))

        # API Route: Crypto Proxy (with 5-min Cache)
        elif parsed_path.path == '/api/crypto':
            now = time.time()
            if CRYPTO_CACHE['data'] and (now - CRYPTO_CACHE['time']) < CACHE_DURATION:
                data = CRYPTO_CACHE['data']
            else:
                url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true'
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                try:
                    with urllib.request.urlopen(req, timeout=20) as response:
                        data = response.read()
                        CRYPTO_CACHE['data'] = data
                        CRYPTO_CACHE['time'] = now
                except Exception as e:
                    if CRYPTO_CACHE['data']: # Fallback to stale cache on error
                        data = CRYPTO_CACHE['data']
                    else:
                        self.send_error(500, str(e))
                        return
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data)
                
        # API Route: RSS News Feed
        elif parsed_path.path == '/api/news':
            url = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,AAPL,TSLA,BTC-USD&region=US&lang=en-US"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            try:
                with urllib.request.urlopen(req, timeout=15) as response:
                    xml_data = response.read()
                    root = ET.fromstring(xml_data)
                    news_items = []
                    for item in root.findall('./channel/item'):
                        news_items.append({
                            'title': item.find('title').text if item.find('title') is not None else '',
                            'link': item.find('link').text if item.find('link') is not None else '',
                            'pubDate': item.find('pubDate').text if item.find('pubDate') is not None else '',
                            'description': item.find('description').text if item.find('description') is not None else ''
                        })
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(news_items).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
        # API Route: Portfolio file storage (GET)
        elif parsed_path.path == '/api/portfolio':
            try:
                with open('portfolio.json', 'r', encoding='utf-8') as f:
                    data = f.read()
            except FileNotFoundError:
                data = json.dumps([])
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data.encode('utf-8'))

        # API Route: Real Binance Account Balances
        elif parsed_path.path == '/api/binance/account':
            api_key = query_params.get('api_key', [''])[0]
            api_secret = query_params.get('api_secret', [''])[0]
            if not api_key or not api_secret:
                self.send_error(400, "Missing api_key or api_secret")
                return
            timestamp = int(time.time() * 1000)
            query_string = f"timestamp={timestamp}"
            signature = hmac.new(
                api_secret.encode('utf-8'),
                query_string.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            url = f"https://api.binance.com/api/v3/account?{query_string}&signature={signature}"
            req = urllib.request.Request(url, headers={
                'X-MBX-APIKEY': api_key,
                'User-Agent': 'Mozilla/5.0',
            })
            try:
                with urllib.request.urlopen(req, timeout=15) as response:
                    data = response.read()
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_error(500, str(e))

        # Static Files
        else:
            super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        if parsed_path.path == '/api/chat':
            # AI API disabled — local parser in app.js handles portfolio commands.
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            resp = {
                "text": "AI API is paused. Try describing your trade directly — e.g. \"I bought 10 NVDA at $120\" or \"$1000 in Tesla on 24 april 2024\" — and I'll handle it locally.",
                "action": None
            }
            self.wfile.write(json.dumps(resp).encode('utf-8'))

        elif parsed_path.path == '/api/portfolio':
            try:
                holdings = json.loads(body.decode('utf-8'))
                with open('portfolio.json', 'w', encoding='utf-8') as f:
                    json.dump(holdings, f, indent=2)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))

        elif parsed_path.path == '/api/portfolio/import-csv':
            query_params_post = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            broker = query_params_post.get('broker', ['generic'])[0].lower()

            ISIN_MAP = {
                'IE00B3RBWM25': 'VWCE.DE', 'IE00B4L5Y983': 'IWDA.AS',
                'IE00BKX55T58': 'VUSA.AS', 'IE00B5BMR087': 'CSPX.AS',
                'LU1681043599': 'CSNDX.AS', 'IE00B52MJY50': 'IUSA.AS',
                'IE00B1XNHC34': 'IGLN.AS', 'IE00B0M62Q58': 'IEGZ.AS',
                'IE00B4L5YC18': 'IUMO.AS', 'LU0274208692': 'XMME.DE',
                'IE00B4L5YX21': 'WSML.AS', 'IE00B52VJ196': 'IQQH.DE',
                'LU0629459743': 'XDWD.DE', 'IE00BYWQWR46': 'VWRL.AS',
                'IE00BF4RFH31': 'IUSQ.DE', 'LU1291098637': 'XDEW.DE',
            }

            KRAKEN_MAP = {
                'XXBT': 'BTC', 'XETH': 'ETH', 'XLTC': 'LTC', 'XXLM': 'XLM',
                'XZEC': 'ZEC', 'XMLN': 'MLN', 'XXRP': 'XRP', 'XREP': 'REP',
                'ZEUR': None, 'ZUSD': None, 'ZGBP': None, 'ZCAD': None,
            }

            def parse_num(s):
                if not s: return 0.0
                return float(str(s).replace(' ', '').replace(',', '.').replace('€','').replace('$','').replace('%',''))

            def resolve_isin(raw):
                up = raw.strip().upper()
                return ISIN_MAP.get(up, up)

            try:
                text = body.decode('utf-8-sig')
                holdings = []

                # ── Indexa Capital ────────────────────────────────────────
                if broker == 'indexa':
                    # Semicolon-delimited, European decimals
                    # Columns: Fecha;Tipo;Fondo;ISIN;Participaciones;Valor Liquidativo;Importe
                    reader = csv.DictReader(io.StringIO(text), delimiter=';')
                    for row in reader:
                        keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                        tipo = keys.get('tipo', '').lower()
                        if tipo not in ('compra', 'suscripcion', 'suscripción', 'traspaso entrada'):
                            continue
                        isin = keys.get('isin') or keys.get('fondo') or ''
                        ticker = resolve_isin(isin)
                        qty_raw   = keys.get('participaciones') or keys.get('títulos') or keys.get('titulos') or '0'
                        price_raw = keys.get('valor liquidativo') or keys.get('valor_liquidativo') or keys.get('precio') or '0'
                        date_raw  = keys.get('fecha') or ''
                        try:
                            qty   = parse_num(qty_raw)
                            price = parse_num(price_raw)
                        except (ValueError, TypeError):
                            continue
                        if qty <= 0 or not ticker:
                            continue
                        holdings.append({'ticker': ticker, 'qty': qty, 'price': price, 'date': date_raw})

                # ── Degiro ────────────────────────────────────────────────
                elif broker == 'degiro':
                    # Columns: Date,Product,ISIN,Description,FX,Change,,,,Order ID
                    # Also semicolon-delimited in some regions
                    delim = ';' if text.count(';') > text.count(',') else ','
                    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
                    for row in reader:
                        keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                        isin   = keys.get('isin') or ''
                        ticker = resolve_isin(isin) if isin else (keys.get('product') or '').strip().upper()
                        qty_raw   = (keys.get('number') or keys.get('quantity') or
                                     keys.get('número') or keys.get('nombre') or '0')
                        price_raw = keys.get('price') or keys.get('precio') or '0'
                        date_raw  = keys.get('date') or keys.get('fecha') or ''
                        if not ticker:
                            continue
                        try:
                            qty   = parse_num(qty_raw)
                            price = parse_num(price_raw)
                        except (ValueError, TypeError):
                            continue
                        if qty <= 0:
                            continue
                        holdings.append({'ticker': ticker, 'qty': qty, 'price': price, 'date': date_raw})

                # ── Coinbase ──────────────────────────────────────────────
                elif broker == 'coinbase':
                    # First 7 rows are metadata — skip until we hit the header row
                    lines = text.splitlines()
                    header_idx = 0
                    for i, line in enumerate(lines):
                        if 'transaction type' in line.lower() or 'asset' in line.lower():
                            header_idx = i
                            break
                    reader = csv.DictReader(io.StringIO('\n'.join(lines[header_idx:])))
                    for row in reader:
                        keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                        tx_type = (keys.get('transaction type') or keys.get('type') or '').lower()
                        if 'buy' not in tx_type and 'purchase' not in tx_type:
                            continue
                        ticker    = (keys.get('asset') or '').upper()
                        qty_raw   = keys.get('quantity transacted') or keys.get('quantity') or '0'
                        price_raw = (keys.get('price at transaction') or keys.get('spot price at transaction') or
                                     keys.get('price') or '0')
                        date_raw  = keys.get('timestamp') or keys.get('date') or ''
                        if not ticker:
                            continue
                        try:
                            qty   = parse_num(qty_raw)
                            price = parse_num(price_raw)
                        except (ValueError, TypeError):
                            continue
                        if qty <= 0:
                            continue
                        holdings.append({'ticker': ticker, 'qty': qty, 'price': price, 'date': date_raw[:10] if date_raw else ''})

                # ── Binance CSV ───────────────────────────────────────────
                elif broker == 'binance_csv':
                    # Columns: Date(UTC),Pair,Side,Price,Executed,Amount,Fee
                    reader = csv.DictReader(io.StringIO(text))
                    for row in reader:
                        keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                        side = (keys.get('side') or '').upper()
                        if side != 'BUY':
                            continue
                        pair = keys.get('pair') or ''
                        # Strip quote currencies to get base asset
                        ticker = pair
                        for quote in ('USDT','BUSD','USDC','BTC','ETH','BNB','EUR','GBP'):
                            if pair.endswith(quote):
                                ticker = pair[:-len(quote)]
                                break
                        price_raw = keys.get('price') or '0'
                        qty_raw   = keys.get('executed') or keys.get('amount') or '0'
                        date_raw  = keys.get('date(utc)') or keys.get('date') or ''
                        if not ticker:
                            continue
                        try:
                            qty   = parse_num(qty_raw.split(' ')[0])
                            price = parse_num(price_raw)
                        except (ValueError, TypeError):
                            continue
                        if qty <= 0:
                            continue
                        holdings.append({'ticker': ticker.upper(), 'qty': qty, 'price': price, 'date': date_raw[:10] if date_raw else ''})

                # ── eToro ─────────────────────────────────────────────────
                elif broker == 'etoro':
                    # Columns: Date,Type,Details,Amount,Units,Realized Equity Change,...,Open Rate
                    # Filter: Type == "Open Position"
                    reader = csv.DictReader(io.StringIO(text))
                    for row in reader:
                        keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                        tx_type = (keys.get('type') or '').lower()
                        if 'open' not in tx_type and 'buy' not in tx_type:
                            continue
                        details = keys.get('details') or keys.get('action') or ''
                        # Details format: "BUY AAPL at $..." or "AAPL/USD"
                        parts = details.replace('/', ' ').split()
                        ticker = ''
                        for p in parts:
                            if p.upper() not in ('BUY','SELL','AT','USD','EUR') and len(p) >= 2:
                                ticker = p.upper()
                                break
                        qty_raw   = keys.get('units') or keys.get('quantity') or '0'
                        price_raw = keys.get('open rate') or keys.get('price') or '0'
                        date_raw  = keys.get('date') or ''
                        if not ticker:
                            continue
                        try:
                            qty   = parse_num(qty_raw)
                            price = parse_num(price_raw)
                        except (ValueError, TypeError):
                            continue
                        if qty <= 0:
                            continue
                        holdings.append({'ticker': ticker, 'qty': qty, 'price': price, 'date': date_raw[:10] if date_raw else ''})

                # ── Revolut ───────────────────────────────────────────────
                elif broker == 'revolut':
                    # Columns: Date,Ticker,Type,Quantity,Price per share,Total Amount
                    reader = csv.DictReader(io.StringIO(text))
                    for row in reader:
                        keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                        tx_type = (keys.get('type') or '').upper()
                        if tx_type not in ('BUY', 'PURCHASE', 'BUY - MARKET', 'BUY - LIMIT'):
                            continue
                        ticker    = (keys.get('ticker') or keys.get('symbol') or '').upper()
                        qty_raw   = keys.get('quantity') or keys.get('shares') or '0'
                        price_raw = (keys.get('price per share') or keys.get('price') or '0')
                        date_raw  = keys.get('date') or ''
                        if not ticker:
                            continue
                        try:
                            qty   = parse_num(qty_raw)
                            price = parse_num(price_raw)
                        except (ValueError, TypeError):
                            continue
                        if qty <= 0:
                            continue
                        holdings.append({'ticker': ticker, 'qty': qty, 'price': price, 'date': date_raw[:10] if date_raw else ''})

                # ── Kraken ────────────────────────────────────────────────
                elif broker == 'kraken':
                    # Ledger columns: txid,refid,time,type,subtype,aclass,asset,amount,fee,balance
                    reader = csv.DictReader(io.StringIO(text))
                    for row in reader:
                        keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                        tx_type = (keys.get('type') or '').lower()
                        if tx_type not in ('trade', 'buy', 'purchase'):
                            continue
                        raw_asset = keys.get('asset') or ''
                        if raw_asset.upper() in KRAKEN_MAP:
                            mapped = KRAKEN_MAP[raw_asset.upper()]
                        else:
                            mapped = raw_asset.lstrip('XZ') if len(raw_asset) > 3 else raw_asset
                        if not mapped:
                            continue
                        amount_raw = keys.get('amount') or '0'
                        try:
                            amount = parse_num(amount_raw)
                        except (ValueError, TypeError):
                            continue
                        if amount <= 0:
                            continue
                        date_raw = (keys.get('time') or '')[:10]
                        holdings.append({'ticker': mapped.upper(), 'qty': amount, 'price': 0, 'date': date_raw})

                # ── Interactive Brokers ───────────────────────────────────
                elif broker == 'ibkr':
                    # Multi-section format. Find "Trades,Data,Order,..." rows.
                    lines = text.splitlines()
                    in_trades = False
                    trade_lines = []
                    header_line = ''
                    for line in lines:
                        cells = next(csv.reader([line]))
                        if not cells:
                            continue
                        section = cells[0].strip()
                        if section == 'Trades':
                            if len(cells) > 1 and cells[1].strip() == 'Header':
                                header_line = line
                                in_trades = True
                                continue
                            if in_trades and len(cells) > 1 and cells[1].strip() == 'Data':
                                trade_lines.append(line)
                        elif section != '' and section != 'Trades':
                            in_trades = False

                    if header_line and trade_lines:
                        reader = csv.DictReader(io.StringIO(header_line + '\n' + '\n'.join(trade_lines)))
                        for row in reader:
                            keys = {k.strip().lower(): str(v).strip() for k, v in row.items()}
                            ticker    = (keys.get('symbol') or '').upper()
                            qty_raw   = keys.get('quantity') or '0'
                            price_raw = keys.get('t. price') or keys.get('price') or '0'
                            date_raw  = (keys.get('date/time') or '')[:10]
                            if not ticker:
                                continue
                            try:
                                qty   = abs(parse_num(qty_raw))
                                price = parse_num(price_raw)
                            except (ValueError, TypeError):
                                continue
                            if qty <= 0:
                                continue
                            holdings.append({'ticker': ticker, 'qty': qty, 'price': price, 'date': date_raw})

                # ── Generic fallback ──────────────────────────────────────
                else:
                    delim = ';' if text.count(';') > text.count(',') else ','
                    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
                    for row in reader:
                        keys = {k.lower().strip(): str(v).strip() for k, v in row.items()}
                        raw_ticker = (keys.get('ticker') or keys.get('symbol') or
                                      keys.get('isin')   or keys.get('fund')   or
                                      keys.get('asset')  or keys.get('codigo') or '')
                        ticker = resolve_isin(raw_ticker)
                        qty_raw   = (keys.get('qty') or keys.get('quantity') or keys.get('shares') or
                                     keys.get('units') or keys.get('participaciones') or '0')
                        price_raw = (keys.get('price') or keys.get('precio') or keys.get('avg_price') or
                                     keys.get('cost')  or keys.get('coste')  or '0')
                        date_raw  = keys.get('date') or keys.get('fecha') or ''
                        if not ticker:
                            continue
                        try:
                            qty   = parse_num(qty_raw)
                            price = parse_num(price_raw)
                        except (ValueError, TypeError):
                            continue
                        if qty <= 0:
                            continue
                        holdings.append({'ticker': ticker, 'qty': qty, 'price': price, 'date': date_raw})

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'holdings': holdings}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))

        else:
            self.send_error(404, "Not Found")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

with socketserver.TCPServer(("", PORT), FinanceProxyHandler) as httpd:
    print(f"Serving Finance Application at http://localhost:{PORT}")
    httpd.serve_forever()
