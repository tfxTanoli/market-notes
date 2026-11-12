export type Instrument = {
  symbol: string;
  name: string;
  kind: "crypto" | "stock";
  /** keywords that resolve a question to this instrument */
  keywords: string[];
  /** CoinGecko id for crypto */
  geckoId?: string;
  /** simulated base price for stocks */
  basePrice?: number;
};

export const INSTRUMENTS: Instrument[] = [
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", keywords: ["bitcoin", "btc"], geckoId: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", keywords: ["ethereum", "ether", "eth"], geckoId: "ethereum" },
  { symbol: "SOL", name: "Solana", kind: "crypto", keywords: ["solana", "sol"], geckoId: "solana" },
  { symbol: "DOGE", name: "Dogecoin", kind: "crypto", keywords: ["dogecoin", "doge"], geckoId: "dogecoin" },
  { symbol: "XRP", name: "XRP", kind: "crypto", keywords: ["xrp", "ripple"], geckoId: "ripple" },
  { symbol: "ADA", name: "Cardano", kind: "crypto", keywords: ["cardano", "ada"], geckoId: "cardano" },
  { symbol: "AAPL", name: "Apple", kind: "stock", keywords: ["apple", "aapl"], basePrice: 227.4 },
  { symbol: "TSLA", name: "Tesla", kind: "stock", keywords: ["tesla", "tsla"], basePrice: 248.9 },
  { symbol: "NVDA", name: "Nvidia", kind: "stock", keywords: ["nvidia", "nvda"], basePrice: 131.2 },
  { symbol: "MSFT", name: "Microsoft", kind: "stock", keywords: ["microsoft", "msft"], basePrice: 428.1 },
  { symbol: "AMZN", name: "Amazon", kind: "stock", keywords: ["amazon", "amzn"], basePrice: 186.5 },
  { symbol: "GOOGL", name: "Alphabet", kind: "stock", keywords: ["google", "alphabet", "googl"], basePrice: 164.3 },
  { symbol: "META", name: "Meta", kind: "stock", keywords: ["meta", "facebook"], basePrice: 563.7 },
];

export type Quote = {
  price: number;
  change24h: number; // percent
  source: "live" | "simulated";
};

export type Note = {
  id: string;
  question: string;
  createdAt: number;
  symbol?: string;
  name?: string;
  quote?: Quote;
  note?: string;
  error?: string;
};

/** Find the instrument a free-text question is about. */
export function resolveInstrument(question: string): Instrument | undefined {
  const q = question.toLowerCase();
  // longest keyword match wins so "solana" beats "sol" inside other words
  let best: { instrument: Instrument; len: number } | undefined;
  for (const instrument of INSTRUMENTS) {
    for (const kw of instrument.keywords) {
      const re = new RegExp(`\\b${kw}\\b`, "i");
      if (re.test(q) && kw.length > (best?.len ?? 0)) {
        best = { instrument, len: kw.length };
      }
    }
  }
  return best?.instrument;
}

const priceCache = new Map<string, { quote: Quote; at: number }>();
const CACHE_MS = 30_000;

async function fetchCryptoQuote(geckoId: string): Promise<Quote> {
  const cached = priceCache.get(geckoId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.quote;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Price service unavailable");
  const data = (await res.json()) as Record<string, { usd: number; usd_24h_change?: number }>;
  const row = data[geckoId];
  if (!row) throw new Error("No price data returned");
  const quote: Quote = {
    price: row.usd,
    change24h: row.usd_24h_change ?? 0,
    source: "live",
  };
  priceCache.set(geckoId, { quote, at: Date.now() });
  return quote;
}

/** Deterministic-ish random walk around a base price, re-seeded hourly. */
function simulatedStockQuote(instrument: Instrument): Quote {
  const base = instrument.basePrice ?? 100;
  const hour = Math.floor(Date.now() / 3_600_000);
  // simple seeded pseudo-random from symbol + hour
  let seed = hour;
  for (const c of instrument.symbol) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const change24h = (rand() - 0.5) * 6; // -3% .. +3%
  const price = base * (1 + change24h / 100 + (rand() - 0.5) * 0.01);
  return { price, change24h, source: "simulated" };
}

export async function getQuote(instrument: Instrument): Promise<Quote> {
  if (instrument.kind === "crypto" && instrument.geckoId) {
    return fetchCryptoQuote(instrument.geckoId);
  }
  return simulatedStockQuote(instrument);
}

export function formatPrice(n: number, currency = "USD", locale = "en-US"): string {
  const digits = n >= 1000 ? 0 : n >= 10 ? 2 : 4;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/** A short plain-language remark about the move. */
export function remark(quote: Quote, name: string): string {
  const c = quote.change24h;
  if (c >= 5) return `${name} is surging today — a strong move, so expect volatility both ways.`;
  if (c >= 1.5) return `${name} is up solidly over the last 24 hours, trading with positive momentum.`;
  if (c > -1.5) return `${name} is roughly flat over the last 24 hours, holding near recent levels.`;
  if (c > -5) return `${name} has slipped over the last 24 hours, giving back some recent gains.`;
  return `${name} is down sharply today — a steep move, so watch for a bounce or further weakness.`;
}
