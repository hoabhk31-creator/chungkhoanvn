"""
Institutional Equity Research Matrix (IERM) - Comprehensive Vietnam Corporate Database
Đồng bộ và lưu trữ toàn bộ dữ liệu 650+ doanh nghiệp niêm yết từ FiinTrade / Google Sheets.
Hỗ trợ tra cứu nhanh, phân loại ngành ICB 2, ICB 4, FiinTrade, P/E, P/B, ROE, Vốn hóa và KQKD.
"""

import os
import csv
import json
import sqlite3
import re
from typing import Dict, Any, List, Optional
import httpx

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

COMPANIES_JSON_PATH = os.path.join(DATA_DIR, "vietnam_companies_database.json")
SECTORS_JSON_PATH = os.path.join(DATA_DIR, "vietnam_sectors_database.json")
SQLITE_DB_PATH = os.path.join(DATA_DIR, "vietnam_stocks.db")
RAW_COMPANIES_CSV_PATH = os.path.join(os.path.dirname(__file__), "vietnam_companies_data.csv")
RAW_SECTORS_CSV_PATH = os.path.join(os.path.dirname(__file__), "vietnam_sectors_data.csv")

GOOGLE_SHEET_ID = "1aS34Kw1TwQBIlSWv8yHvnKHPfkyEPYj2"
SHEET_GID_COMPANIES = "669462497"
SHEET_GID_SECTORS = "687580202"

COMPANY_DATABASE: Dict[str, Dict[str, Any]] = {}
SECTOR_DATABASE: Dict[str, Dict[str, Any]] = {}


def _parse_vn_number(val: str, default=0.0) -> float:
    if not val or not val.strip() or val.strip() in ['-', 'N/A', '#N/A', '', 'None']:
        return default
    s = val.strip().replace(' ', '').replace('%', '')
    if '.' in s and ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return default


def _load_databases():
    global COMPANY_DATABASE, SECTOR_DATABASE
    # 1. Load companies
    if os.path.exists(COMPANIES_JSON_PATH):
        try:
            with open(COMPANIES_JSON_PATH, "r", encoding="utf-8") as f:
                COMPANY_DATABASE = json.load(f)
        except Exception as e:
            print(f"Error loading {COMPANIES_JSON_PATH}: {e}")
            COMPANY_DATABASE = {}

    # 2. Load sectors
    if os.path.exists(SECTORS_JSON_PATH):
        try:
            with open(SECTORS_JSON_PATH, "r", encoding="utf-8") as f:
                SECTOR_DATABASE = json.load(f)
        except Exception as e:
            print(f"Error loading {SECTORS_JSON_PATH}: {e}")
            SECTOR_DATABASE = {}


_load_databases()


def get_company(ticker: str) -> Optional[Dict[str, Any]]:
    """Tra cứu thông tin chi tiết một doanh nghiệp theo mã chứng khoán."""
    clean = ticker.upper().strip()
    return COMPANY_DATABASE.get(clean)


def search_companies(
    keyword: str = "",
    exchange: Optional[str] = None,
    sector: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Tìm kiếm doanh nghiệp theo từ khóa (mã hoặc tên), sàn giao dịch (HOSE, HNX, UPCOM)
    hoặc phân loại ngành (ICB2, ICB4, FiinTrade).
    """
    kw = keyword.strip().lower()
    ex = exchange.upper().strip() if exchange else None
    sec = sector.strip().lower() if sector else None

    results = []
    for c in COMPANY_DATABASE.values():
        if ex and c.get("exchange") != ex:
            continue
        if sec and not any(sec in (c.get(k) or "").lower() for k in ["icb2", "icb4", "fiintrade_sector"]):
            continue
        if kw:
            match_ticker = kw in c["ticker"].lower()
            match_name = kw in c["name"].lower()
            match_sec = any(kw in (c.get(k) or "").lower() for k in ["icb2", "icb4", "fiintrade_sector"])
            if not (match_ticker or match_name or match_sec):
                continue
        results.append(c)
        if len(results) >= limit:
            break
    return results


def get_sector_peers_from_db(ticker: str, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Tìm các doanh nghiệp đối thủ cùng ngành chính xác nhất trong cơ sở dữ liệu 650+ mã.
    Ưu tiên 1: Cùng ngành FiinTrade chi tiết (ví dụ: Khai khoáng, Bất động sản công nghiệp...)
    Ưu tiên 2: Cùng ngành ICB cấp 4
    Ưu tiên 3: Cùng ngành ICB cấp 2
    Sắp xếp các đối thủ theo Vốn hóa thị trường (market_cap_bil) giảm dần từ lớn đến bé.
    """
    target = get_company(ticker)
    if not target:
        return []

    clean_ticker = ticker.upper().strip()
    t_fiin = (target.get("fiintrade_sector") or "").strip()
    t_icb4 = (target.get("icb4") or "").strip()
    t_icb2 = (target.get("icb2") or "").strip()

    peers = []
    added = {clean_ticker}

    # Tier 1: Cùng ngành FiinTrade
    if t_fiin:
        for c in COMPANY_DATABASE.values():
            if c["ticker"] not in added and (c.get("fiintrade_sector") or "").strip() == t_fiin:
                peers.append(c)
                added.add(c["ticker"])

    # Tier 2: Cùng ngành ICB 4 nếu nhóm FiinTrade quá ít (< 3 mã)
    if t_icb4 and len(peers) < 3:
        for c in COMPANY_DATABASE.values():
            if c["ticker"] not in added and (c.get("icb4") or "").strip() == t_icb4:
                peers.append(c)
                added.add(c["ticker"])

    # Tier 3: Cùng ngành ICB 2 nếu vẫn quá ít (< 3 mã)
    if t_icb2 and len(peers) < 3:
        for c in COMPANY_DATABASE.values():
            if c["ticker"] not in added and (c.get("icb2") or "").strip() == t_icb2:
                peers.append(c)
                added.add(c["ticker"])

    # Sắp xếp toàn bộ đối thủ theo Vốn hóa thị trường (market_cap_bil) giảm dần
    peers.sort(key=lambda x: x.get("market_cap_bil", 0.0), reverse=True)
    return peers[:limit]


def get_all_sectors_summary() -> List[Dict[str, Any]]:
    """Trả về danh sách dữ liệu tăng trưởng các ngành kinh tế từ cơ sở dữ liệu."""
    return list(SECTOR_DATABASE.values())


async def sync_from_google_sheets(force: bool = False) -> Dict[str, Any]:
    """
    Tải trực tiếp bản cập nhật mới nhất từ Google Sheets của người dùng và làm mới cơ sở dữ liệu.
    URL: https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/edit?gid={SHEET_GID_COMPANIES}
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    url_c = f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/export?format=csv&gid={SHEET_GID_COMPANIES}"
    url_s = f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/export?format=csv&gid={SHEET_GID_SECTORS}"

    async with httpx.AsyncClient(headers=headers, timeout=40.0, follow_redirects=True) as client:
        resp_c = await client.get(url_c)
        if resp_c.status_code == 200:
            with open(RAW_COMPANIES_CSV_PATH, "wb") as f:
                f.write(resp_c.content)

        resp_s = await client.get(url_s)
        if resp_s.status_code == 200:
            with open(RAW_SECTORS_CSV_PATH, "wb") as f:
                f.write(resp_s.content)

    rebuild_database_from_csv()
    _load_databases()

    return {
        "status": "success",
        "total_companies": len(COMPANY_DATABASE),
        "total_sectors": len(SECTOR_DATABASE),
        "message": f"Đã đồng bộ thành công {len(COMPANY_DATABASE)} doanh nghiệp và {len(SECTOR_DATABASE)} phân ngành từ Google Sheets."
    }


def rebuild_database_from_csv():
    """Tái cấu trúc và lưu trữ toàn bộ dữ liệu từ file CSV thành JSON và SQLite DB."""
    if not os.path.exists(RAW_COMPANIES_CSV_PATH):
        return

    with open(RAW_COMPANIES_CSV_PATH, "r", encoding="utf-8") as f:
        reader = list(csv.reader(f))

    companies = {}
    for r_idx in range(11, len(reader)):
        row = reader[r_idx]
        if len(row) <= 4 or not row[2].strip():
            continue

        ticker = row[2].strip().upper()
        name = row[3].strip()
        if ticker == "LHG":
            name = "CTCP Long Hậu"
        exchange = row[4].strip().upper()
        icb2 = row[5].strip() if len(row) > 5 else ""
        icb4 = row[6].strip() if len(row) > 6 else ""
        fiintrade_sec = row[7].strip() if len(row) > 7 else ""
        if "bất động sản công nghiệp" in fiintrade_sec.lower():
            fiintrade_sec = "Bất động sản Khu công nghiệp"

        raw_mcap_str = (row[8] if len(row) > 8 else "").strip().replace('.', '').replace(' ', '')
        try:
            mcap_bil = float(raw_mcap_str) if raw_mcap_str and raw_mcap_str not in ['-', 'N/A', '#N/A', ''] else 0.0
        except Exception:
            mcap_bil = 0.0

        raw_p = row[9].strip() if len(row) > 9 else ""
        raw_p_clean = raw_p.replace('.', '').replace(',', '.')
        try:
            price = float(raw_p_clean)
        except Exception:
            price = 0.0

        p_chg_2w = _parse_vn_number(row[10] if len(row) > 10 else "")
        p_chg_1m = _parse_vn_number(row[11] if len(row) > 11 else "")
        p_chg_3m = _parse_vn_number(row[12] if len(row) > 12 else "")
        p_chg_ytd = _parse_vn_number(row[13] if len(row) > 13 else "")

        vol_3m_k = _parse_vn_number(row[14].replace('.', '') if len(row) > 14 else "")
        val_3m_bil = _parse_vn_number(row[15] if len(row) > 15 else "")

        roe_ttm = _parse_vn_number(row[16] if len(row) > 16 else "")
        eps = _parse_vn_number(row[17].replace('.', '') if len(row) > 17 else "")
        eps_growth_yoy = _parse_vn_number(row[18] if len(row) > 18 else "")

        pe_3y = _parse_vn_number(row[19] if len(row) > 19 else "")
        pe_ttm = _parse_vn_number(row[20] if len(row) > 20 else "")
        pe_plan = _parse_vn_number(row[21] if len(row) > 21 else "")

        pb_3y = _parse_vn_number(row[22] if len(row) > 22 else "")
        pb_ttm = _parse_vn_number(row[23] if len(row) > 23 else "")

        rev_q1_26 = _parse_vn_number(row[24] if len(row) > 24 else "")
        rev_growth_yoy = _parse_vn_number(row[30] if len(row) > 30 else "")

        np_q1_26 = _parse_vn_number(row[32] if len(row) > 32 else "")
        np_growth_yoy = _parse_vn_number(row[38] if len(row) > 38 else "")

        npat_mi_q1_26 = _parse_vn_number(row[40] if len(row) > 40 else "")
        npat_mi_growth_yoy = _parse_vn_number(row[46] if len(row) > 46 else "")

        source = row[48].strip() if len(row) > 48 else "FiinTrade"

        companies[ticker] = {
            "ticker": ticker,
            "name": name,
            "exchange": exchange,
            "icb2": icb2,
            "icb4": icb4,
            "fiintrade_sector": fiintrade_sec,
            "market_cap_bil": mcap_bil,
            "price": price,
            "price_change_2w_pct": p_chg_2w,
            "price_change_1m_pct": p_chg_1m,
            "price_change_3m_pct": p_chg_3m,
            "price_change_ytd_pct": p_chg_ytd,
            "avg_volume_3m_k": vol_3m_k,
            "avg_value_3m_bil": val_3m_bil,
            "roe_ttm_pct": roe_ttm,
            "eps": eps,
            "eps_growth_yoy_pct": eps_growth_yoy,
            "pe_3y": pe_3y,
            "pe_ttm": pe_ttm,
            "pe_plan": pe_plan,
            "pb_3y": pb_3y,
            "pb_ttm": pb_ttm,
            "revenue_q1_26_bil": rev_q1_26,
            "revenue_growth_yoy_pct": rev_growth_yoy,
            "net_profit_q1_26_bil": np_q1_26,
            "net_profit_growth_yoy_pct": np_growth_yoy,
            "npat_mi_q1_26_bil": npat_mi_q1_26,
            "npat_mi_growth_yoy_pct": npat_mi_growth_yoy,
            "update_source": source
        }

    with open(COMPANIES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(companies, f, ensure_ascii=False, indent=2)

    conn = sqlite3.connect(SQLITE_DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS companies (
        ticker TEXT PRIMARY KEY,
        name TEXT,
        exchange TEXT,
        icb2 TEXT,
        icb4 TEXT,
        fiintrade_sector TEXT,
        market_cap_bil REAL,
        price REAL,
        price_change_1m_pct REAL,
        roe_ttm_pct REAL,
        eps REAL,
        pe_ttm REAL,
        pb_ttm REAL,
        revenue_q1_26_bil REAL,
        revenue_growth_yoy_pct REAL,
        net_profit_q1_26_bil REAL,
        net_profit_growth_yoy_pct REAL,
        update_source TEXT
    )
    """)
    for c in companies.values():
        cur.execute("""
        INSERT OR REPLACE INTO companies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            c["ticker"], c["name"], c["exchange"], c["icb2"], c["icb4"], c["fiintrade_sector"],
            c["market_cap_bil"], c["price"], c["price_change_1m_pct"], c["roe_ttm_pct"],
            c["eps"], c["pe_ttm"], c["pb_ttm"], c["revenue_q1_26_bil"], c["revenue_growth_yoy_pct"],
            c["net_profit_q1_26_bil"], c["net_profit_growth_yoy_pct"], c["update_source"]
        ))
    conn.commit()
    conn.close()

    if os.path.exists(RAW_SECTORS_CSV_PATH):
        with open(RAW_SECTORS_CSV_PATH, "r", encoding="utf-8") as f:
            reader_s = list(csv.reader(f))
        sectors = {}
        for r_idx in range(9, len(reader_s)):
            row = reader_s[r_idx]
            clean = [c.strip() for c in row if c.strip()]
            if not clean:
                continue
            sec_name = ""
            reported = ""
            mcap_coverage = ""
            q1_25 = ""
            q2_25 = ""
            q3_25 = ""
            q4_25 = ""
            q1_26 = ""
            plan_26 = ""
            if len(row) > 3 and row[3].strip():
                sec_name = row[3].strip()
                reported = row[7].strip() if len(row) > 7 else ""
                mcap_coverage = row[8].strip() if len(row) > 8 else ""
                q1_25 = row[10].strip() if len(row) > 10 else ""
                q2_25 = row[11].strip() if len(row) > 11 else ""
                q3_25 = row[12].strip() if len(row) > 12 else ""
                q4_25 = row[13].strip() if len(row) > 13 else ""
                q1_26 = row[14].strip() if len(row) > 14 else ""
                plan_26 = row[15].strip() if len(row) > 15 else ""
            elif len(clean) >= 2:
                sec_name = clean[0]

            if sec_name and sec_name not in ['Theo vốn hóa:', 'STT', 'NGÀNH']:
                sectors[sec_name] = {
                    "sector_name": sec_name,
                    "companies_reported": reported,
                    "mcap_coverage_pct": mcap_coverage,
                    "earnings_growth_q1_25": q1_25,
                    "earnings_growth_q2_25": q2_25,
                    "earnings_growth_q3_25": q3_25,
                    "earnings_growth_q4_25": q4_25,
                    "earnings_growth_q1_26": q1_26,
                    "earnings_growth_plan_2026": plan_26
                }
        with open(SECTORS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(sectors, f, ensure_ascii=False, indent=2)
