"""ATTINERA local server. Serves this folder and prints a LAN address for your phone on the same Wi-Fi.

    python run.py                 serve on http://localhost:8000
    python run.py --refresh       first re-pull the products.js catalog from the brands' public Shopify feeds
    python run.py --catalog-only  refresh the catalog and exit
"""
import functools, http.server, json, os, re, socket, sys, time, urllib.error, urllib.request, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'products.js')
STORES = {
    'kotn.com': 'Kotn',
    'hilarymacmillan.com': 'Hilary MacMillan',
    'provinceofcanada.com': 'Province of Canada',
    'frankandoak.com': 'Frank And Oak',
    'tentree.ca': 'tentree',
    'allbirds.ca': 'Allbirds',
    'duer.ca': 'DUER',
    'ardene.com/en-ca': 'Ardene',
}

def has(text, *words):
    return any(re.search(r'\b' + w + r'\b', text) for w in words)

SKIP = ['socks?', 'underwear', 'bras?', 'briefs?', 'boxers?', 'gift', 'towels?', 'blankets?', 'candles?', 'pillows?', 'sheets?',
        'duvet', 'comforter', 'bags?', 'totes?', 'masks?', 'cards?', 'insoles?', 'laces', 'slippers?', 'swim', 'bikini', 'stickers?', 'hammock']
CATS = [
    ('top', ['dress shirts?']),
    ('dress', ['dress(es)?', 'jumpsuits?', 'rompers?']),
    ('outerwear', ['jackets?', 'coats?', 'parkas?', 'puffers?', 'bombers?', 'blazers?', 'vests?', 'anoraks?', 'trench', 'shackets?', 'overshirts?']),
    ('shoes', ['shoes?', 'sneakers?', 'runners?', 'boots?', 'loafers?', 'sandals?', 'trainers?', 'dashers?', 'loungers?', 'pipers?', 'mizzles?', 'cruisers?']),
    ('bottom', ['pants?', 'jeans?', 'shorts', 'skirts?', 'trousers?', 'chinos?', 'leggings?', 'joggers?', 'sweatpants?']),
    ('accessory', ['hats?', 'beanies?', 'toques?', 'scarf', 'scarves', 'gloves?', 'mittens?', 'caps?']),
    ('top', ['shirts?', 't-shirts?', 'tees?', 'sweaters?', 'hoodies?', 'crew(neck)?s?', 'tanks?', 'polos?', 'cardigans?', 'sweatshirts?',
             'blouses?', 'tops?', 'turtlenecks?', 'henleys?', 'bodysuits?', 'pullovers?', 'knit', 'camis?']),
]
COLORS = [
    ('pattern', ['stripes?', 'striped', 'plaid', 'check(ed)?', 'print(ed)?', 'floral', 'gingham', 'camo', 'tie[- ]dye', 'pattern']),
    ('pastel', ['pink', 'lavender', 'lilac', 'mint', 'sky', 'light blue', 'blush', 'peach', 'butter', 'pale', 'baby blue', 'rose']),
    ('dark', ['black', 'navy', 'charcoal', 'dark', 'forest', 'olive', 'burgundy', 'brown', 'espresso', 'chocolate', 'slate', 'midnight',
              'ink', 'deep', 'maroon', 'wine']),
    ('neutral', ['white', 'cream', 'ivory', 'beige', 'oat(meal)?', 'sand', 'gr[ae]y', 'taupe', 'natural', 'stone', 'khaki', 'camel', 'tan',
                 'ecru', 'bone', 'heather', 'undyed']),
    ('bright', ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'fuchsia', 'coral', 'cobalt', 'teal', 'magenta', 'lime', 'gold']),
]

def style_of(t):
    if has(t, 'suits?', 'tuxedos?', 'gowns?', 'satin', 'heels?', 'slip dress'): return 'formal'
    if has(t, 'blazers?', 'trousers?', 'dress shirts?', 'oxfords?', 'tailored', 'wool coats?', 'topcoats?'): return 'business'
    if not has(t, 'denim', 'jeans?', 'flannel', 'oxford', 'chinos?', 'trousers?', 'dress shirt', 'overshirt') and has(t, 'running', 'training', 'workout', 'gym', 'yoga', 'activewear', 'athletic', 'sports?', 'leggings?', 'track pants?'): return 'sport'
    if has(t, 'knit', 'cardigans?', 'polos?', 'chinos?', 'loafers?', 'merino', 'cashmere', 'turtlenecks?', 'button[- ]?(up|down)', 'linen',
           'pleated', 'wrap', 'silk', 'midi', 'blouses?'): return 'smart'
    return 'casual'

def warmth_of(t):
    if has(t, 'parkas?', 'puffers?', 'down (jacket|coat|parka|vest)', 'insulated', 'sherpa', 'shearling', 'boots?', 'beanies?', 'toques?', 'scarf',
           'scarves', 'gloves?', 'mittens?', 'wool coats?', 'winter', 'quilted', 'heavyweight'): return 3
    if has(t, 'tanks?', 'shorts', 'tees?', 't-shirts?', 'linen', 'sandals?', 'short sleeve', 'sleeveless', 'camis?', 'lightweight'): return 1
    return 2

def classify(title, ptype, color_text, tags):
    t = f'{title} {ptype}'.lower()
    if has(t, *SKIP): return None
    cat = next((c for c, words in CATS if has(t, *words)), None)
    if not cat: return None
    ct = f'{color_text} {title}'.lower()
    tg = re.sub(r'[_-]', ' ', ' '.join(tags if isinstance(tags, list) else tags.split(','))).lower()
    gender_text = t if has(t, 'women', 'womens', "women's", 'men', 'mens', "men's", 'unisex') else tg
    women = has(gender_text, 'women', 'womens', "women\'s")
    men = has(gender_text, 'men', 'mens', "men\'s")
    return {
        'cat': cat, 'style': style_of(t), 'warmth': warmth_of(t),
        'color': next((c for c, words in COLORS if has(ct, *words)), 'neutral'),
        'wp': has(t, 'waterproof', 'gore-tex'),
        'g': 'u' if (women and men) or has(gender_text, 'unisex') else 'w' if women else 'm' if men else 'unknown',
    }

def check():
    assert classify('Essential Crew Tee in Black', '', 'Black', [])['cat'] == 'top'
    assert classify('Oxford Dress Shirt', '', '', [])['cat'] == 'top'
    assert classify("Women's Waterproof Boots", 'Shoes', 'Navy', [])['wp'] is True
    assert classify('Crew Sock 3-Pack', '', '', []) is None
    p = classify('Down Parka', '', 'Olive', ['mens'])
    assert (p['cat'], p['warmth'], p['color'], p['g']) == ('outerwear', 3, 'dark', 'm')
    assert classify('Linen Short Sleeve Shirt', '', 'Light Blue', ['womens'])['g'] == 'w'

def get_json(url):
    # One request only. Never retry a refusal or bypass retailer access controls.
    req = urllib.request.Request(url, headers={'User-Agent': 'ATTINERA/1.0 (student wardrobe planner prototype)'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

def parse_products(products, domain, brand, currency='CAD'):
    out = []
    for p in products:
        available = [v for v in p.get('variants', []) if v.get('available') and float(v.get('price') or 0) > 0]
        if not p.get('images') or not available: continue
        v0 = min(available, key=lambda v: float(v['price']))
        ci = next((i for i, o in enumerate(p.get('options', [])) if o['name'].lower() in ('color', 'colour')), None)
        tags = classify(p['title'], p.get('product_type', ''), v0.get(f'option{ci+1}', '') if ci is not None else '', p.get('tags', []))
        if not tags: continue
        img = (v0.get('featured_image') or {}).get('src') or p['images'][0]['src']
        price = round(float(v0['price']), 2)
        compare = round(float(v0.get('compare_at_price') or 0), 2)
        out.append({'id': f"{domain}:{p['handle']}", 'name': p['title'], 'brand': brand,
            'url': f"https://{domain}/products/{p['handle']}?variant={v0['id']}",
            'img': img + ('&' if '?' in img else '?') + 'width=500',
            'price': price, 'compareAt': compare if compare > price else None,
            'currency': currency, 'checkedAt': time.strftime('%Y-%m-%d'),
            'priceVaries': len({v['price'] for v in available}) > 1, **tags})
    return out

def fetch_store(domain, brand):
    currency = get_json(f'https://{domain}/cart.js').get('currency')
    if currency != 'CAD': raise ValueError('Canadian pricing could not be verified')
    out = []
    for page in range(1, 5):
        products = get_json(f'https://{domain}/products.json?limit=250&page={page}')['products']
        out.extend(parse_products(products, domain, brand, currency))
        if len(products) < 250: break
        time.sleep(2)
    return out

def read_catalog():
    if not os.path.exists(OUT): return []
    with open(OUT, encoding='utf-8') as f:
        return json.loads(f.read().split('window.PRODUCTS = ', 1)[1].strip().rstrip(';'))

def write_catalog(catalog):
    temp = OUT + '.tmp'
    with open(temp, 'w', encoding='utf-8') as f:
        f.write(f'window.PRODUCTS_UPDATED = {json.dumps(time.strftime("%Y-%m-%d"))};\nwindow.PRODUCTS = {json.dumps(catalog, ensure_ascii=False)};\n')
    os.replace(temp, OUT)

def refresh():
    check()
    catalog = read_catalog()
    for domain, brand in STORES.items():
        try:
            items = fetch_store(domain, brand)
            print(f'{brand}: {len(items)} items', flush=True)
            catalog = [p for p in catalog if p['brand'] != brand] + items
        except Exception as e:
            print(f'{brand}: keeping previous items ({e})', flush=True)
    if catalog: write_catalog(catalog)
    print(f'Catalog: {len(catalog)} products')

class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows' registry sometimes maps .js to text/plain, which breaks ES modules.
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')  # local dev: always pick up edited files
        super().end_headers()

def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))  # no packet is sent; just picks the outgoing interface
            return s.getsockname()[0]
    except OSError:
        return None

if __name__ == '__main__':
    if '--refresh' in sys.argv or '--catalog-only' in sys.argv or not os.path.exists(OUT):
        refresh()
    if '--catalog-only' in sys.argv: sys.exit(0)
    port = 8000
    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), functools.partial(Handler, directory=HERE))
    ip = lan_ip()
    print(f'ATTINERA running at  http://localhost:{port}')
    if ip: print(f'On your phone (same Wi-Fi):  http://{ip}:{port}')
    print('Ctrl+C to stop')
    if '--no-browser' not in sys.argv: webbrowser.open(f'http://localhost:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
