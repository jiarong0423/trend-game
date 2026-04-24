"""Export 50 stocks OHLCV from Investor-Calendar DB to JSON files."""
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).parent
PRICE_DB = ROOT.parent / "Investor-Calendar" / "db" / "price_history.db"
EVENT_DB = ROOT.parent / "Investor-Calendar" / "db" / "investor_cal.db"
OUT_DIR = ROOT / "data"
PRICES_DIR = OUT_DIR / "prices"
PRICES_DIR.mkdir(parents=True, exist_ok=True)

MIN_DAYS = 250

MANUAL_NAMES = {
    "8464": "億豐",
    "4438": "廣穎",
    "5314": "世紀",
    "6620": "峰源-KY",
}


def stock_list():
    with sqlite3.connect(PRICE_DB) as c:
        rows = c.execute(
            "SELECT stock_id, COUNT(*) d FROM daily_prices "
            "GROUP BY stock_id HAVING d>=? ORDER BY d DESC, stock_id",
            (MIN_DAYS,),
        ).fetchall()
    return [r[0] for r in rows]


def stock_names(ids):
    with sqlite3.connect(EVENT_DB) as c:
        rows = c.execute(
            f"SELECT DISTINCT stock_id, stock_name FROM events "
            f"WHERE stock_id IN ({','.join('?' * len(ids))})",
            ids,
        ).fetchall()
    names = dict(rows)
    for sid in ids:
        if sid not in names:
            names[sid] = MANUAL_NAMES.get(sid, sid)
    return names


def export_prices(sid):
    with sqlite3.connect(PRICE_DB) as c:
        rows = c.execute(
            "SELECT trade_date, open_price, high_price, low_price, "
            "close_price, volume FROM daily_prices "
            "WHERE stock_id=? ORDER BY trade_date",
            (sid,),
        ).fetchall()
    out = []
    for d, o, h, l, cl, v in rows:
        if cl is None or o is None:
            continue
        out.append(
            {"t": d, "o": o, "h": h, "l": l, "c": cl, "v": v or 0}
        )
    (PRICES_DIR / f"{sid}.json").write_text(
        json.dumps(out, separators=(",", ":"))
    )
    return len(out)


def main():
    ids = stock_list()
    names = stock_names(ids)
    catalog = []
    for sid in ids:
        n = export_prices(sid)
        catalog.append({"id": sid, "name": names[sid], "days": n})
        print(f"  {sid} {names[sid]:10s} {n} days")
    (OUT_DIR / "stocks.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2)
    )
    print(f"\nExported {len(catalog)} stocks to {OUT_DIR}")


if __name__ == "__main__":
    main()
