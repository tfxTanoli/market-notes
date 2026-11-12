import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { SettingsLink } from "@/components/settings";
import { useServerFn } from "@tanstack/react-start";
import { useAccount } from "@/components/account-provider";
import { SearchLimitDialog } from "@/components/search-limit-dialog";
import { consumeAccountSearch, consumeVisitorSearch, peekAccountSearch, peekVisitorSearch } from "@/lib/search.functions";
import {
  INSTRUMENTS,
  formatChange,
  formatPrice,
  getQuote,
  remark,
  resolveInstrument,
  type Note,
} from "@/lib/market";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Market Notes — ask the market, keep the answers" },
      {
        name: "description",
        content:
          "A notebook for market questions. Ask about stocks and crypto on the left, keep the answers on the right.",
      },
      { property: "og:title", content: "Market Notes — ask the market, keep the answers" },
      {
        property: "og:description",
        content:
          "A notebook for market questions. Ask about stocks and crypto on the left, keep the answers on the right.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const STORAGE_KEY = "market-notes:v1";
const CURRENCY_KEY = "market-notes:currency";
const VISITOR_TOKEN_KEY = "market-notes:visitor";

const CURRENCY_CODES =
  "USD AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL".split(
    " ",
  );

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

function currencySymbol(code: string) {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? code
    );
  } catch {
    return code;
  }
}

const CURRENCIES = CURRENCY_CODES.map((code) => ({
  code,
  country: currencyNames.of(code) ?? code,
  locale: "en",
  symbol: currencySymbol(code),
}));

type CurrencyCode = string;

const SUGGESTIONS = [
  "What is the price of Bitcoin?",
  "Is Ethereum up or down today?",
  "How is Apple stock doing?",
];

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

function Index() {
  const { user, loading: accountLoading } = useAccount();
  const accountSearch = useServerFn(consumeAccountSearch);
  const visitorSearch = useServerFn(consumeVisitorSearch);
  const peekAccount = useServerFn(peekAccountSearch);
  const peekVisitor = useServerFn(peekVisitorSearch);
  const [limitOpen, setLimitOpen] = useState(false);
  const [usage, setUsage] = useState<{ used: number; daily_limit: number | null } | null>(null);

  useEffect(() => {
    if (accountLoading) return;
    let cancelled = false;
    setUsage(null);
    (async () => {
      try {
        if (user) {
          const r = await peekAccount();
          if (!cancelled) setUsage(r);
        } else {
          let token: string | undefined;
          try { token = localStorage.getItem(VISITOR_TOKEN_KEY) ?? undefined; } catch { /* storage blocked */ }
          const r = await peekVisitor({ data: { token } });
          try { localStorage.setItem(VISITOR_TOKEN_KEY, r.token); } catch { /* storage blocked */ }
          if (!cancelled) setUsage(r);
        }
      } catch { /* leave counter hidden */ }
    })();
    return () => { cancelled = true; };
  }, [user, accountLoading]);
  const [searchError, setSearchError] = useState('');
  const asking = useRef(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [currencyPending, setCurrencyPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNotes(loadNotes());
    const savedCurrency = localStorage.getItem(CURRENCY_KEY);
    if (CURRENCIES.some((item) => item.code === savedCurrency)) {
      setCurrency(savedCurrency as CurrencyCode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem(CURRENCY_KEY, currency);
    if (currency === "USD") {
      setExchangeRate(1);
      setCurrencyPending(false);
      return;
    }

    const controller = new AbortController();
    setCurrencyPending(true);
    const fromExchangeRateApi = () =>
      fetch("https://open.er-api.com/v6/latest/USD", { signal: controller.signal, cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("ExchangeRate-API unavailable");
          return r.json() as Promise<{ rates?: Record<string, number> }>;
        })
        .then((d) => {
          const rate = d.rates?.[currency];
          if (typeof rate !== "number") throw new Error("Missing rate");
          return rate;
        });
    const fromFloatRates = () =>
      fetch("https://www.floatrates.com/daily/usd.json", { signal: controller.signal, cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("FloatRates unavailable");
          return r.json() as Promise<Record<string, { rate?: number }>>;
        })
        .then((d) => {
          const rate = d[currency.toLowerCase()]?.rate;
          if (typeof rate !== "number") throw new Error("Missing rate");
          return rate;
        });

    fromExchangeRateApi()
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return fromFloatRates();
      })
      .then((rate) => setExchangeRate(rate))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCurrency("USD");
        }
      })
      .finally(() => setCurrencyPending(false));

    return () => controller.abort();
  }, [currency]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking.current || accountLoading) return;
    asking.current = true;
    setPending(true);
    setSearchError('');
    try {
      let allowance: { allowed: boolean; used: number; daily_limit: number | null };
      if (user) {
        allowance = await accountSearch();
      } else {
        let token: string | undefined;
        try { token = localStorage.getItem(VISITOR_TOKEN_KEY) ?? undefined; } catch { /* storage blocked */ }
        const result = await visitorSearch({ data: { token } });
        try { localStorage.setItem(VISITOR_TOKEN_KEY, result.token); } catch { /* storage blocked */ }
        allowance = result;
      }
      setUsage({ used: allowance.used, daily_limit: allowance.daily_limit });
      if (!allowance.allowed) {
        setLimitOpen(true);
        return;
      }
    setQuestion("");

    const instrument = resolveInstrument(q);
    const note: Note = { id: crypto.randomUUID(), question: q, createdAt: Date.now() };

    if (!instrument) {
      note.error = "No stock or crypto found in that question.";
    } else {
      note.symbol = instrument.symbol;
      note.name = instrument.name;
      try {
        const quote = await getQuote(instrument);
        note.quote = quote;
        note.note = remark(quote, instrument.name);
      } catch {
        note.error = "The price service didn't respond.";
      }
    }

    setNotes((prev) => [note, ...prev]);
    setOpenId(note.id);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Your search allowance could not be checked. Please try again.');
    } finally {
      asking.current = false;
      setPending(false);
    }
  }

  const selectedCurrency =
    CURRENCIES.find((item) => item.code === currency) ?? { code: 'USD', locale: 'en', country: 'US Dollar', symbol: '$' };

  return (
    <div className="min-h-screen bg-background font-display text-foreground">
      <SettingsLink />
      <SearchLimitDialog open={limitOpen} signedIn={Boolean(user)} onOpenChange={setLimitOpen} />
      <div className="mx-auto w-full max-w-2xl px-6 pb-24 pt-20 sm:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex items-baseline gap-4"
        >
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="price of bitcoin"
            aria-label="Market question"
            disabled={pending || accountLoading}
            className="min-w-0 flex-1 bg-transparent text-[26px] font-semibold tracking-[-0.02em] outline-none placeholder:text-muted-foreground"
          />
          {pending && <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />}
        </form>

        <p className="mt-2 text-[14px] font-bold text-foreground">
          Enter a question, then press Enter on your keyboard.
        </p>
        {usage && (
          <p className="mt-1 text-[14px] text-muted-foreground" aria-live="polite">
            Searches you have today:{" "}
            <span className="font-bold text-foreground">
              {usage.daily_limit == null ? "∞" : Math.max(0, usage.daily_limit - usage.used)}
            </span>
          </p>
        )}
        {searchError && <p role="alert" className="mt-3 text-sm text-destructive">{searchError}</p>}

        <label className="mt-7 flex w-fit items-center gap-2 text-[14px] text-muted-foreground">
          <span>Prices for</span>
          <select
            aria-label="Country and currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
            className="cursor-pointer bg-transparent font-medium text-foreground outline-none"
          >
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code} suppressHydrationWarning>
                {`${item.country} (${item.symbol})`}
              </option>
            ))}
          </select>
          {currencyPending && <Loader2 className="size-3.5 animate-spin" aria-label="Updating prices" />}
        </label>

        {notes.length === 0 && (
          <div className="mt-10 space-y-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="block text-left text-[26px] font-semibold tracking-[-0.02em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {s.toLowerCase().replace("?", "")}
              </button>
            ))}
          </div>
        )}

        <ul className="mt-10 space-y-7">
          {notes.map((n) => {
            const open = openId === n.id;
            return (
              <li key={n.id}>
                <button
                  onClick={() => setOpenId(open ? null : n.id)}
                  className="flex w-full items-baseline gap-4 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-[26px] font-semibold leading-tight tracking-[-0.02em]">
                    {n.question.toLowerCase().replace("?", "")}
                  </span>
                   <span className="shrink-0 text-[24px] tabular-nums text-foreground">
                    {n.quote ? (
                       formatPrice(
                         n.quote.price * exchangeRate,
                         selectedCurrency.code,
                         selectedCurrency.locale,
                       )
                    ) : (
                      <span className="text-[17px]">—</span>
                    )}
                  </span>
                </button>

                {open && (
                  <div className="mt-2 space-y-1 pr-1">
                    {n.quote && (
                      <p className="text-[15px] text-muted-foreground">
                        <span className={n.quote.change24h >= 0 ? "text-up" : "text-down"}>
                          {formatChange(n.quote.change24h)}
                        </span>{" "}
                        24h · {n.symbol} · {n.quote.source === "live" ? "live" : "simulated"}
                      </p>
                    )}
                    <p className="max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
                      {n.error ?? n.note}
                    </p>
                    <button
                      onClick={() => {
                        setNotes((prev) => prev.filter((x) => x.id !== n.id));
                        setOpenId(null);
                      }}
                      className="text-[15px] text-muted-foreground transition-colors hover:text-down"
                    >
                      delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-16 text-[13px] text-muted-foreground">
          crypto live · stocks simulated · {INSTRUMENTS.length} tracked
        </p>
      </div>
    </div>
  );
}
