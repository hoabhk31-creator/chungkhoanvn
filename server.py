"""
Institutional Equity Research Matrix (IERM) - FastAPI Server
"""

import io
import os
import csv
import httpx
import unicodedata
import urllib.parse
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

def to_ascii_slug(text: str) -> str:
    """Chuyển đổi chuỗi có dấu tiếng Việt thành chuỗi không dấu ASCII an toàn cho HTTP headers và tên file."""
    if not text:
        return ""
    text = str(text).replace("đ", "d").replace("Đ", "D")
    nfkd = unicodedata.normalize('NFKD', text)
    ascii_text = "".join(c for c in nfkd if not unicodedata.combining(c))
    slug = "".join(c if (c.isalnum() or c in ("-", "_")) else "_" for c in ascii_text)
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug.strip("_")

def make_content_disposition(disposition_type: str, raw_filename: str) -> str:
    """Tạo header Content-Disposition chuẩn RFC 6266 / RFC 5987, an toàn latin-1 và hỗ trợ UTF-8."""
    base_name = raw_filename.rsplit(".", 1)[0] if "." in raw_filename else raw_filename
    ext = f".{raw_filename.rsplit('.', 1)[1]}" if "." in raw_filename else ""
    ascii_name = f"{to_ascii_slug(base_name)}{ext}"
    if not ascii_name or ascii_name == ext:
        ascii_name = f"document{ext}"
    utf8_encoded = urllib.parse.quote(raw_filename)
    return f'{disposition_type}; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_encoded}'

from engine import (
    ReportItem,
    FullMatrixReport,
    PRESET_DATASETS,
    calculate_consensus,
    extract_financial_data_from_text
)
from crawler import (
    crawl_url_content,
    parse_pdf_bytes,
    search_institutional_reports,
    fetch_reconciled_live_price,
    fetch_live_market_tape,
    fetch_stock_company_profile,
    fetch_stock_corporate_capital,
    fetch_edocs_reports,
    parse_edocs_item_to_report,
    generate_sector_institutional_reports,
    fetch_industry_reports,
    get_ssi_fastconnect_status
)
from financial_data import get_financial_data_bundle, calculate_dcf_model, VIETNAM_STOCK_DIRECTORY
from company_database import (
    COMPANY_DATABASE,
    SECTOR_DATABASE,
    get_company,
    search_companies,
    get_all_sectors_summary,
    sync_from_google_sheets
)
from pdf_generator import generate_ctck_report_pdf, generate_matrix_table_pdf, generate_peer_comparison_pdf
from ssi_fastconnect import (
    SSI_API_CATALOG,
    SSI_CONFIG,
    SSIFastConnectClient,
    fetch_hybrid_ohlcv_data,
    calculate_technical_indicators,
    get_stock_depth_metrics,
    get_market_overview
)

app = FastAPI(
    title="Institutional Equity Research Matrix (IERM)",
    description="Fintech Research Co-Pilot & WebApp Engine for Vietnam Financial Market",
    version="1.0.0"
)

# Thư mục static UI
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class CrawlRequest(BaseModel):
    url: str
    ticker: Optional[str] = "HPG"
    institution: Optional[str] = "CTCK"


class RawTextAnalysisRequest(BaseModel):
    raw_text: str
    ticker: Optional[str] = "HPG"
    institution: Optional[str] = "CTCK"


class ReconcileRequest(BaseModel):
    ticker: str
    company_name: Optional[str] = ""
    sector: Optional[str] = ""
    current_market_price: Optional[float] = None
    price_source_info: Optional[dict] = None
    reports: List[ReportItem]


class ExportRequest(BaseModel):
    report_data: FullMatrixReport


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h2>IERM Dashboard is initializing... Please refresh shortly.</h2>")


CLIENT_ERROR_LOGS = []

@app.post("/api/client-log")
async def log_client_error(data: dict):
    CLIENT_ERROR_LOGS.append(data)
    print(f"[CLIENT LOG/ERROR] {data}")
    return {"status": "ok", "total": len(CLIENT_ERROR_LOGS)}

@app.get("/api/client-log")
async def get_client_errors():
    return {"errors": CLIENT_ERROR_LOGS}



@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "engine": "IERM Quantitative Engine v1.0",
        "available_presets": list(PRESET_DATASETS.keys())
    }


@app.get("/api/presets")
async def get_presets():
    return [
        {
            "ticker": k,
            "company_name": v.company_name,
            "sector": v.sector,
            "reports_count": len(v.matrix_table),
            "consensus_rating": v.consensus_summary.consensus_rating,
            "mean_target_price": v.consensus_summary.mean_target_price,
            "upside": v.consensus_summary.average_upside,
            "market_price": v.consensus_summary.current_market_price,
            "market_to_fair_value_ratio": v.consensus_summary.market_to_fair_value_ratio
        }
        for k, v in PRESET_DATASETS.items()
    ]


@app.get("/api/live-price/{ticker}")
async def get_live_price(ticker: str):
    """
    Lấy giá đóng cửa mới nhất trên chart Vietstock (https://finance.vietstock.vn/phan-tich-ky-thuat.htm)
    và đối chiếu với bảng giá của các CTCK (VNDirect, DNSE), lấy nguồn nào mới hơn.
    """
    clean_ticker = ticker.upper().strip()
    price_info = await fetch_reconciled_live_price(clean_ticker)
    return price_info


@app.get("/api/preset/{ticker}")
async def get_preset_by_ticker(ticker: str, sync_live_price: bool = True):
    clean_ticker = ticker.upper().strip()
    profile = await fetch_stock_company_profile(clean_ticker)
    comp_name = profile.get("name")
    sect_name = profile.get("sector")

    if clean_ticker in PRESET_DATASETS:
        report = PRESET_DATASETS[clean_ticker]
        if comp_name and (report.company_name.startswith("Công ty Cổ phần " + clean_ticker) or report.company_name.startswith("CTCP " + clean_ticker)):
            report.company_name = comp_name
        if sect_name and report.sector in ["Doanh nghiệp niêm yết", "Doanh nghiệp Niêm yết"]:
            report.sector = sect_name

        if sync_live_price:
            try:
                live_info = await fetch_reconciled_live_price(clean_ticker)
                if live_info and "latest_close" in live_info:
                    # Tái tính toán consensus với giá live mới nhất
                    reconciled = calculate_consensus(
                        reports=report.matrix_table,
                        ticker=report.ticker,
                        company_name=report.company_name,
                        sector=report.sector,
                        current_market_price=live_info["latest_close"],
                        price_source_info=live_info
                    )
                    PRESET_DATASETS[clean_ticker] = reconciled
                    return reconciled
            except Exception as e:
                print(f"Sync live price failed for {clean_ticker}: {e}")
        return report

    # Nếu mã chưa có trong PRESET tĩnh (vd: ACB, LHG, TCH, SSI, VND, VIC...)
    try:
        live_info = await fetch_reconciled_live_price(clean_ticker)
        market_p = live_info.get("latest_close", 25000.0) if live_info else 25000.0
    except Exception:
        market_p = 25000.0
        live_info = None

    stock_meta = VIETNAM_STOCK_DIRECTORY.get(clean_ticker, {})
    final_comp_name = comp_name or stock_meta.get("name", f"Công ty Cổ phần {clean_ticker}")
    final_sect_name = sect_name or stock_meta.get("sector", "Doanh nghiệp niêm yết")

    # 1. Thử lấy báo cáo phân tích thực tế từ cổng Vietstock eDocs
    sample_reports = []
    try:
        raw_edocs = await fetch_edocs_reports(clean_ticker, limit=8)
        if raw_edocs:
            for idx, item in enumerate(raw_edocs):
                parsed_rep = parse_edocs_item_to_report(
                    item=item,
                    clean_ticker=clean_ticker,
                    comp_name=final_comp_name,
                    sector_name=final_sect_name,
                    market_p=market_p,
                    index=idx
                )
                sample_reports.append(parsed_rep)
    except Exception as edocs_err:
        print(f"Error processing eDocs reports for {clean_ticker}: {edocs_err}")

    # 2. Tuân thủ nguyên tắc Fact & Data First: Nếu mã cổ phiếu không có báo cáo phân tích từ các CTCK,
    # để trống danh sách reports, tuyệt đối không tự bịa nội dung điền vào.

    reconciled = calculate_consensus(
        reports=sample_reports,
        ticker=clean_ticker,
        company_name=final_comp_name,
        sector=final_sect_name,
        current_market_price=market_p,
        price_source_info=live_info
    )
    PRESET_DATASETS[clean_ticker] = reconciled
    return reconciled


@app.get("/api/ssi/status")
async def get_ssi_status():
    """
    Trả về trạng thái kết nối & chẩn đoán của dịch vụ SSI FastConnect Data API.
    """
    return get_ssi_fastconnect_status()


@app.get("/api/market-tape")
async def get_market_tape(ticker: Optional[str] = None):
    """
    Lấy dữ liệu chỉ số thị trường (VN-INDEX, VN30) và các mã cổ phiếu tiêu biểu
    trực tiếp từ API bảng giá các CTCK (DNSE Entrade, Vietstock).
    """
    tape = await fetch_live_market_tape(ticker)
    return tape


@app.get("/api/industry-reports")
async def get_industry_reports(
    ticker: Optional[str] = "HPG",
    keyword: Optional[str] = None,
    report_type: Optional[int] = None,
    source: Optional[str] = None,
    all_industries: Optional[bool] = False,
    limit: int = 50
):
    """
    Truy xuất danh sách báo cáo phân tích ngành, báo cáo hàng hóa và vĩ mô liên quan trực tiếp
    tới mã cổ phiếu đang xem (từ Vietstock eDocs, các CTCK và FireAnt).
    Khi all_industries=True: hiển thị toàn bộ báo cáo mới nhất của tất cả các ngành.
    """
    res = await fetch_industry_reports(
        ticker=ticker,
        keyword=keyword,
        report_type_id=report_type,
        source_name=source,
        all_industries=bool(all_industries),
        page_size=limit
    )
    return res


@app.get("/api/benchmark-recommendations")
async def get_benchmark_recommendations():
    """
    Trả về danh sách các mã cổ phiếu tiêu biểu kèm khuyến nghị và upside đồng thuận mới nhất
    từ các CTCK để hiển thị trên thanh chip điều hướng nhanh (MÃ TIÊU BIỂU).
    """
    benchmark_symbols = ["HPG", "SSI", "HCM", "VNM", "FPT", "MWG", "GEX", "PDR"]
    results = []
    for sym in benchmark_symbols:
        if sym in PRESET_DATASETS:
            rep = PRESET_DATASETS[sym]
            cs = rep.consensus_summary
            if cs and (cs.average_upside < 0 or (cs.mean_target_price > 0 and cs.current_market_price > cs.mean_target_price)):
                short_rating = "VƯỢT MỤC TIÊU"
                raw_rating = cs.consensus_rating
            elif cs and (cs.mean_target_price <= 0 or "THEO DÕI" in (cs.consensus_rating or "").upper()):
                short_rating = "THEO DÕI"
                raw_rating = cs.consensus_rating
            else:
                raw_rating = cs.consensus_rating.split("(")[0].strip() if cs else "MUA"
                short_rating = "MUA" if "MUA" in raw_rating else ("KHẢ QUAN" if "KHẢ QUAN" in raw_rating else ("TÍCH LŨY" if "TÍCH LŨY" in raw_rating else "NẮM GIỮ"))
            results.append({
                "ticker": sym,
                "name": rep.company_name,
                "sector": rep.sector,
                "rating": short_rating,
                "full_rating": raw_rating,
                "upside": cs.average_upside if cs else 25.0,
                "target_price": cs.mean_target_price if cs else 0,
                "current_price": cs.current_market_price if cs else rep.current_price
            })
        else:
            info = VIETNAM_STOCK_DIRECTORY.get(sym, {})
            results.append({
                "ticker": sym,
                "name": info.get("name", sym),
                "sector": info.get("sector", "Doanh nghiệp niêm yết"),
                "rating": "KHẢ QUAN",
                "full_rating": "KHẢ QUAN",
                "upside": 25.0,
                "target_price": 0,
                "current_price": 25000
            })
    return results

class DcfCustomRequest(BaseModel):
    ticker: str
    wacc: float = 11.5
    terminal_g: float = 2.5
    fcf_growth_rate: float = 15.0
    projection_years: int = 5
    current_market_price: Optional[float] = None


@app.get("/api/financial-overview/{ticker}")
async def get_financial_overview(ticker: str):
    """
    Truy xuất toàn bộ phân tích BCTC, Dupont 3 & 5 bước, Piotroski F-score, Altman Z-score, và định giá DCF.
    """
    clean_ticker = ticker.upper().strip()
    try:
        live_price_info = await fetch_reconciled_live_price(clean_ticker)
        market_p = live_price_info.get("latest_close", 25000.0) if live_price_info else 25000.0
    except Exception:
        market_p = 25000.0

    profile = await fetch_stock_company_profile(clean_ticker)
    capital_info = await fetch_stock_corporate_capital(clean_ticker)
    data = get_financial_data_bundle(
        clean_ticker,
        current_market_price=market_p,
        company_name=profile.get("name"),
        sector=profile.get("sector"),
        corporate_capital=capital_info
    )
    return data


@app.get("/api/peers/{ticker}")
async def get_peers_comparison(ticker: str):
    """
    Truy xuất danh sách đối thủ cùng ngành, trung bình ngành, radar chart và mô hình 5 lực lượng cạnh tranh Porter.
    """
    clean_ticker = ticker.upper().strip()
    try:
        live_price_info = await fetch_reconciled_live_price(clean_ticker)
        market_p = live_price_info.get("latest_close", 25000.0) if live_price_info else 25000.0
    except Exception:
        market_p = 25000.0

    profile = await fetch_stock_company_profile(clean_ticker)
    capital_info = await fetch_stock_corporate_capital(clean_ticker)
    data = get_financial_data_bundle(
        clean_ticker,
        current_market_price=market_p,
        company_name=profile.get("name"),
        sector=profile.get("sector"),
        corporate_capital=capital_info
    )
    return data["peers_data"]


@app.post("/api/valuation/dcf")
async def post_dcf_valuation(req: DcfCustomRequest):
    """
    Tính toán lại mô hình định giá DCF tương tác theo các tham số WACC, g, tốc độ tăng trưởng FCF người dùng tùy chỉnh.
    """
    clean_ticker = req.ticker.upper().strip()
    bundle = get_financial_data_bundle(clean_ticker)
    stm = bundle["statements_annual"]
    prof = bundle["company_profile"]
    
    base_fcf = stm["cfo"][-1] * 0.65
    net_debt = (stm["short_term_debt"][-1] + stm["long_term_debt"][-1]) - stm["cash_and_equivalents"][-1]
    
    dcf_res = calculate_dcf_model(
        base_fcf=base_fcf,
        fcf_growth_rate=req.fcf_growth_rate,
        wacc=req.wacc,
        terminal_g=req.terminal_g,
        shares_outstanding=prof["shares_outstanding_mil"],
        net_debt=max(0, net_debt),
        projection_years=req.projection_years
    )
    
    market_p = req.current_market_price or prof["market_cap_bil"] * 1000 / prof["shares_outstanding_mil"]
    mos = ((dcf_res["fair_value_per_share"] - market_p) / market_p) * 100.0 if market_p > 0 else 0.0

    return {
        "ticker": clean_ticker,
        "current_market_price": market_p,
        "dcf_fair_value": dcf_res["fair_value_per_share"],
        "margin_of_safety_percent": round(mos, 2),
        "dcf_details": dcf_res
    }


@app.get("/api/database/companies")
async def get_database_companies(
    q: Optional[str] = None,
    exchange: Optional[str] = None,
    sector: Optional[str] = None,
    limit: int = 100
):
    """
    Truy vấn danh sách doanh nghiệp từ cơ sở dữ liệu 650+ mã cổ phiếu Google Sheets / FiinTrade.
    Hỗ trợ tìm kiếm theo từ khóa mã, tên, sàn giao dịch (HOSE, HNX, UPCOM) và phân ngành.
    """
    results = search_companies(keyword=q or "", exchange=exchange, sector=sector, limit=limit)
    return {
        "total_matches": len(results),
        "total_database_records": len(COMPANY_DATABASE),
        "companies": results
    }


@app.get("/api/database/companies/{ticker}")
async def get_database_company_detail(ticker: str):
    """
    Tra cứu thông tin chi tiết một doanh nghiệp từ cơ sở dữ liệu (P/E, P/B, ROE, Vốn hóa, KQKD Q1-2026).
    """
    company = get_company(ticker)
    if not company:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mã {ticker} trong cơ sở dữ liệu doanh nghiệp")
    return company


@app.get("/api/database/sectors")
async def get_database_sectors():
    """
    Truy xuất danh sách thống kê tăng trưởng lợi nhuận và định giá toàn bộ các phân ngành kinh tế.
    """
    return {
        "total_sectors": len(SECTOR_DATABASE),
        "sectors": get_all_sectors_summary()
    }


@app.post("/api/database/sync")
async def post_sync_database():
    """
    Kích hoạt đồng bộ hóa dữ liệu trực tiếp từ liên kết Google Sheets của người dùng.
    """
    res = await sync_from_google_sheets(force=True)
    return res


class SsiConfigRequest(BaseModel):
    consumer_id: str
    consumer_secret: str


@app.get("/api/ssi/apis")
async def get_ssi_apis_catalog():
    """
    Trả về danh mục 9 mã API chính thức từ cổng SSI FastConnect Data kèm thông tin kết nối.
    """
    return {
        "status": "success",
        "total_apis": len(SSI_API_CATALOG),
        "documentation_url": "https://guide.ssi.com.vn/ssi-products/tieng-viet/fastconnect-data/danh-sach-cac-api",
        "apis": SSI_API_CATALOG,
        "is_configured": bool(SSI_CONFIG.get("consumer_id") and SSI_CONFIG.get("consumer_secret")),
        "active_mode": "SSI FastConnect Live" if SSI_CONFIG.get("access_token") else "Vietstock & Market Reconciled (Dual-Engine)"
    }


@app.post("/api/ssi/config")
async def set_ssi_config(req: SsiConfigRequest):
    """
    Lưu và xác thực thông tin ConsumerID & ConsumerSecret khách hàng để kích hoạt SSI FastConnect Data.
    """
    SSI_CONFIG["consumer_id"] = req.consumer_id.strip()
    SSI_CONFIG["consumer_secret"] = req.consumer_secret.strip()
    client = SSIFastConnectClient()
    token = await client.authenticate()
    return {
        "status": "success" if token else "saved_offline",
        "has_token": bool(token),
        "message": "Đã kết nối thành công tới cổng SSI FastConnect Data API v2!" if token else "Đã lưu cấu hình. Hệ thống sẽ tiếp tục sử dụng cơ chế dự phòng Vietstock Chart nếu cần."
    }


@app.get("/api/ssi/ohlc/{ticker}")
async def get_ssi_ohlcv(ticker: str, count: int = 60):
    """
    Truy xuất nến OHLCV kết hợp (SSI FastConnect DailyOhlc & Vietstock Technical Analysis Chart).
    """
    clean_ticker = ticker.upper().strip()
    candles = await fetch_hybrid_ohlcv_data(clean_ticker, count=count)
    return {
        "ticker": clean_ticker,
        "count": len(candles),
        "candles": candles,
        "source": "SSI FastConnect DailyOhlc / Vietstock Chart Reconciled"
    }


@app.get("/api/ssi/stock-depth/{ticker}")
async def get_ssi_stock_depth(ticker: str):
    """
    Truy xuất dữ liệu thị trường chi tiết theo chuẩn SSI DailyStockPrice API:
    Giá trần, giá sàn, giá tham chiếu, và dòng tiền khối ngoại (Foreign Net Flow).
    """
    clean_ticker = ticker.upper().strip()
    c = get_company(clean_ticker)
    live_p = float(c.get("market_price", 21700)) if c else 21700.0
    try:
        p_info = await fetch_reconciled_live_price(clean_ticker)
        if p_info:
            live_p = p_info.get("latest_close", live_p)
    except Exception:
        pass
    depth = get_stock_depth_metrics(clean_ticker, live_p)
    foreign = depth.get("foreign_trading", {})
    return {
        "status": "success",
        "ticker": clean_ticker,
        "foreign_net_value_bil": foreign.get("net_value_bil", 0.0),
        "foreign_net_volume": foreign.get("net_volume", 0),
        **depth
    }


@app.get("/api/ssi/market-overview")
async def get_ssi_market_overview():
    """
    Truy xuất độ rộng thị trường (Market Breadth) theo chuẩn SSI DailyIndex API:
    Chỉ số VN-INDEX, VN30, số mã tăng, giảm, đứng giá, trần, sàn và giá trị giao dịch.
    """
    return {
        "status": "success",
        **get_market_overview()
    }


@app.get("/api/technical/{ticker}")
async def get_technical_signals(ticker: str, resolution: str = "D", count: int = 120):
    """
    Truy xuất dữ liệu nến kỹ thuật thực tế và tính toán đầy đủ các chỉ báo kỹ thuật:
    MA20, MA50, MA200, EMA20, RSI(14), MACD(12,26,9), Bollinger Bands, Pivot Points (S1-S3, R1-R3).
    Dữ liệu nến được đồng bộ hóa từ SSI FastConnect và Vietstock/VNDirect/DNSE Multi-timeframe Feed.
    """
    clean_ticker = ticker.upper().strip()
    c = get_company(clean_ticker)
    exchange = (c.get("exchange") if c else "HOSE").upper()
    live_p = float(c.get("market_price", 21700)) if c else 21700.0
    try:
        p_info = await fetch_reconciled_live_price(clean_ticker)
        if p_info:
            live_p = p_info.get("latest_close", live_p)
    except Exception:
        pass

    # Lấy chuỗi nến thực tế từ SSI FastConnect / VNDirect / Vietstock / DNSE
    candles = await fetch_hybrid_ohlcv_data(clean_ticker, resolution=resolution, count=count)
    
    # Tính toán toàn bộ chỉ báo kỹ thuật
    tech = calculate_technical_indicators(candles, live_p)
    depth = get_stock_depth_metrics(clean_ticker, live_p)
    foreign = depth.get("foreign_trading", {})

    shares_out = (c.get("shares_outstanding", 6400000000) if c else 6400000000) or 6400000000
    foreign_pct = (c.get("foreign_ownership_pct", 18.5) if c else 18.5) or 18.5

    return {
        "ticker": clean_ticker,
        "exchange": exchange,
        "last_price": tech["last_price"],
        "rsi_14": tech["rsi_14"],
        "rsi_status": tech["rsi_status"],
        "rsi_zone": tech.get("rsi_zone", "neutral"),
        "macd_status": tech["macd"]["status"],
        "macd_line": tech["macd"]["macd"],
        "macd_signal": tech["macd"]["signal"],
        "macd_hist": tech["macd"]["histogram"],
        "sma_20": tech["moving_averages"]["ma20"],
        "sma_50": tech["moving_averages"]["ma50"],
        "sma_200": tech["moving_averages"]["ma200"],
        "ema_20": tech["moving_averages"]["ema20"],
        "bb_upper": tech["bollinger_bands"]["upper"],
        "bb_middle": tech["bollinger_bands"]["middle"],
        "bb_lower": tech["bollinger_bands"]["lower"],
        "pivot_point": tech["pivot_points"]["pivot"],
        "support_1": tech["pivot_points"]["s1"],
        "support_2": tech["pivot_points"]["s2"],
        "support_3": tech["pivot_points"]["s3"],
        "resistance_1": tech["pivot_points"]["r1"],
        "resistance_2": tech["pivot_points"]["r2"],
        "resistance_3": tech["pivot_points"]["r3"],
        "overall_signal": tech["overall_signal"],
        "signal_color": tech["signal_color"],
        "recommendation_score": 8 if "MUA" in tech["overall_signal"] else (5 if "TRUNG" in tech["overall_signal"] else 3),
        "trend_summary": tech["trend_summary"],
        "candles_history": tech["candles_history"],
        "ceiling_price": depth["ceiling_price"],
        "floor_price": depth["floor_price"],
        "reference_price": depth["ref_price"],
        "foreign_buy_volume": foreign.get("buy_volume", 0),
        "foreign_sell_volume": foreign.get("sell_volume", 0),
        "foreign_net_volume": foreign.get("net_volume", 0),
        "foreign_net_value_bil": foreign.get("net_value_bil", 0.0),
        "foreign_current_room": int((foreign_pct / 100.0) * shares_out),
        "foreign_total_room": int(0.49 * shares_out),
        "stock_depth": depth,
        "ma20": tech["moving_averages"]["ma20"],
        "ma50": tech["moving_averages"]["ma50"],
        "ma200": tech["moving_averages"]["ma200"],
        "trend": tech["trend_summary"],
        "resolution": resolution,
        "data_engine": "SSI FastConnect & Vietstock Multi-timeframe Feed"
    }



@app.get("/api/search")
async def search_reports(ticker: str, sector: Optional[str] = ""):
    if not ticker:
        raise HTTPException(status_code=400, detail="Mã cổ phiếu không được để trống")
    results = await search_institutional_reports(ticker, sector or "")
    return {
        "ticker": ticker.upper(),
        "total_found": len(results),
        "results": results
    }


@app.post("/api/crawl-url")
async def api_crawl_url(req: CrawlRequest):
    try:
        clean_ticker = (req.ticker or "HPG").upper().strip()
        data = await crawl_url_content(req.url, ticker=clean_ticker, institution=req.institution or "CTCK")
        
        market_p = 25000.0
        try:
            p_info = await fetch_reconciled_live_price(clean_ticker)
            if p_info:
                market_p = p_info.get("latest_close", 25000.0)
        except Exception:
            pass

        extracted_report = extract_financial_data_from_text(
            raw_text=data["text"],
            default_institution=req.institution or "CTCK",
            ticker=clean_ticker,
            current_market_price=market_p
        )
        extracted_report.source_url = req.url
        return {
            "source_info": data,
            "extracted_report": extracted_report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tải hoặc bóc tách URL: {str(e)}")


@app.post("/api/upload-pdf")
async def api_upload_pdf(
    file: UploadFile = File(...),
    ticker: Optional[str] = Form("HPG"),
    institution: Optional[str] = Form("CTCK")
):
    try:
        clean_ticker = (ticker or "HPG").upper().strip()
        content = await file.read()
        parsed = parse_pdf_bytes(content, filename=file.filename)
        
        market_p = 25000.0
        try:
            p_info = await fetch_reconciled_live_price(clean_ticker)
            if p_info:
                market_p = p_info.get("latest_close", 25000.0)
        except Exception:
            pass

        extracted_report = extract_financial_data_from_text(
            raw_text=parsed["extracted_text"],
            default_institution=institution or "CTCK",
            ticker=clean_ticker,
            current_market_price=market_p
        )
        extracted_report.source_url = f"File: {file.filename} ({parsed['total_pages']} trang)"
        return {
            "file_info": {
                "filename": file.filename,
                "total_pages": parsed["total_pages"],
                "token_count": parsed["token_count"]
            },
            "extracted_report": extracted_report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý file PDF: {str(e)}")


@app.post("/api/analyze-raw")
async def api_analyze_raw(req: RawTextAnalysisRequest):
    if not req.raw_text or len(req.raw_text.strip()) < 20:
        raise HTTPException(status_code=400, detail="Nội dung văn bản quá ngắn để phân tích")
    
    clean_ticker = (req.ticker or "HPG").upper().strip()
    market_p = 25000.0
    try:
        p_info = await fetch_reconciled_live_price(clean_ticker)
        if p_info:
            market_p = p_info.get("latest_close", 25000.0)
    except Exception:
        pass

    report = extract_financial_data_from_text(
        raw_text=req.raw_text,
        default_institution=req.institution or "CTCK",
        ticker=clean_ticker,
        current_market_price=market_p
    )
    return report


@app.post("/api/reconcile")
async def api_reconcile(req: ReconcileRequest):
    if not req.reports:
        raise HTTPException(status_code=400, detail="Cần ít nhất 1 báo cáo phân tích để đối chiếu")
    result = calculate_consensus(
        reports=req.reports,
        ticker=req.ticker,
        company_name=req.company_name or f"Doanh nghiệp {req.ticker.upper()}",
        sector=req.sector or "Doanh nghiệp niêm yết",
        current_market_price=req.current_market_price,
        price_source_info=req.price_source_info
    )
    return result


@app.post("/api/export-markdown")
async def api_export_markdown(req: ExportRequest):
    """
    Kết xuất Báo cáo so sánh đối chiếu chuẩn theo đúng cấu trúc 4 phần yêu cầu của người dùng.
    """
    data = req.report_data
    cs = data.consensus_summary
    reports = data.matrix_table

    md_lines = []
    md_lines.append(f"# BÁO CÁO PHÂN TÍCH ĐỐI CHIẾU ĐA TỔ CHỨC: {data.ticker} ({data.company_name})")
    md_lines.append(f"**Ngành:** {data.sector} | **Thị giá tham chiếu:** {cs.current_market_price:,.0f} VND | **Thời điểm phân tích:** {data.analysis_date}")
    cs_head_up = f"Đã vượt kỳ vọng (+{abs(cs.average_upside):.1f}%)" if cs.average_upside < 0 else f"+{cs.average_upside:.1f}%"
    md_lines.append(f"**Consensus Rating:** {cs.consensus_rating} (Điểm: {cs.consensus_score}/5.0) | **Vùng giá mục tiêu:** {cs.mean_target_price:,.0f} VND ({cs_head_up})\n")
    md_lines.append("---\n")

    # 1. BẢNG MA TRẬN SO SÁNH ĐA TỔ CHỨC
    md_lines.append("## 1. BẢNG MA TRẬN SO SÁNH ĐA TỔ CHỨC (BẮT BUỘC)")
    headers = ["Tiêu chí đối chiếu"] + [r.institution for r in reports] + ["Độ lệch / Đồng thuận chung"]
    md_lines.append("| " + " | ".join(headers) + " |")
    md_lines.append("| " + " | ".join([":---"] * len(headers)) + " |")

    # 1. Ngày phát hành
    dates = [r.report_date for r in reports]
    md_lines.append(f"| **1. Ngày phát hành** | " + " | ".join(dates) + f" | {data.analysis_date} |")

    # 2. Khuyến nghị
    recs = [r.recommendation for r in reports]
    md_lines.append(f"| **2. Khuyến nghị** | " + " | ".join(recs) + f" | **{cs.consensus_rating}** |")

    # 3. Giá mục tiêu
    def _fmt_md_tp(r):
        if getattr(r, "is_expired", False):
            return f"{r.target_price:,.0f} VND (Quá 1 năm)" if r.target_price > 0 else "— (Quá 1 năm)"
        if getattr(r, "is_technical", False) or "PTKT" in (r.recommendation or "").upper():
            return "— (PTKT)"
        if not r.target_price or r.target_price <= 0 or getattr(r, "is_estimated_price", False):
            return "— (KQKD)"
        return f"{r.target_price:,.0f} VND"
    tps = [_fmt_md_tp(r) for r in reports]
    cs_tp_str = f"**{cs.mean_target_price:,.0f} VND**" if cs.mean_target_price > 0 else "**— (Cần theo dõi thêm)**"
    md_lines.append(f"| **3. Giá mục tiêu** | " + " | ".join(tps) + f" | {cs_tp_str} |")

    # 4. Tiềm năng tăng giá
    def _fmt_up(r):
        if getattr(r, "is_expired", False):
            return "— (Quá 1 năm)"
        val = r.upside_percent
        if val is None:
            return "—"
        if val < 0:
            return f"Vượt +{abs(val):.1f}%"
        return f"+{val:.1f}%"
    ups = [_fmt_up(r) for r in reports]
    if cs.mean_target_price <= 0:
        cs_up_str = "— (Cần theo dõi thêm)"
    elif cs.average_upside < 0:
        cs_up_str = f"Đã vượt kỳ vọng (+{abs(cs.average_upside):.1f}%)"
    else:
        cs_up_str = f"+{cs.average_upside:.1f}%"
    md_lines.append(f"| **4. Tiềm năng tăng giá** | " + " | ".join(ups) + f" | **{cs_up_str}** |")

    # 5. P/E forward
    pes = [f"{r.pe_forward:.1f}x" if r.pe_forward else "—" for r in reports]
    valid_pes = [r.pe_forward for r in reports if r.pe_forward and r.pe_forward > 0]
    avg_pe = sum(valid_pes) / len(valid_pes) if valid_pes else 0
    md_lines.append(f"| **5. P/E forward** | " + " | ".join(pes) + f" | {avg_pe:.1f}x |")

    # 6. P/B forward
    pbs = [f"{r.pb_forward:.2f}x" if r.pb_forward else "—" for r in reports]
    valid_pbs = [r.pb_forward for r in reports if r.pb_forward and r.pb_forward > 0]
    avg_pb = sum(valid_pbs) / len(valid_pbs) if valid_pbs else 0
    md_lines.append(f"| **6. P/B forward** | " + " | ".join(pbs) + f" | {avg_pb:.2f}x |")

    # 7. Dự phóng Doanh thu
    revs = [r.revenue_forecast for r in reports]
    md_lines.append(f"| **7. Dự phóng Doanh thu** | " + " | ".join(revs) + " | Đồng thuận tăng trưởng |")

    # 8. Dự phóng LNST
    npats = [r.npat_forecast for r in reports]
    md_lines.append(f"| **8. Dự phóng LNST** | " + " | ".join(npats) + " | Kỳ vọng lợi nhuận bứt phá |")

    # 9. Luận điểm then chốt
    catalysts_cols = []
    for r in reports:
        cat_str = "<br>".join([f"{i+1}. {c}" for i, c in enumerate(r.key_catalysts or [])])
        catalysts_cols.append(cat_str)
    md_lines.append(f"| **9. Luận điểm then chốt** | " + " | ".join(catalysts_cols) + f" | Trọng tâm: Mở rộng quy mô kinh doanh |")

    # 10. Phương pháp định giá
    methods = [r.valuation_method or "—" for r in reports]
    md_lines.append(f"| **10. Phương pháp định giá** | " + " | ".join(methods) + " | Kết hợp P/E & DCF |")

    md_lines.append("\n---\n")

    # 2. PHÂN TÍCH NHÂN QUẢ & ĐỘNG LỰC TĂNG TRƯỞNG CỐT LÕI
    md_lines.append("## 2. PHÂN TÍCH CHUYÊN SÂU: NGUYÊN NHÂN - KẾT QUẢ - BẰNG CHỨNG (CAUSALITY ANALYSIS)\n")
    for c in data.causality_analysis:
        md_lines.append(f"### {c.category}")
        md_lines.append(f"- **Hiện tượng tài chính:** {c.phenomenon}")
        md_lines.append(f"- **Nguyên nhân cốt lõi:** {c.root_causes}")
        md_lines.append(f"- **Bằng chứng số liệu:** {c.data_evidence}\n")

    md_lines.append("---\n")

    # 3. BẢNG PHÂN HÓA QUAN ĐIỂM GIỮA CÁC TỔ CHỨC
    md_lines.append("## 3. BẢNG PHÂN HÓA QUAN ĐIỂM (DISENSUS & CONSENSUS ANALYSIS)\n")
    md_lines.append("| Tiêu chí phân hóa | Phe Lạc quan (Bulls) | Phe Thận trọng (Bears) | Bằng chứng & Luận điểm |")
    md_lines.append("| :--- | :--- | :--- | :--- |")
    for d in data.disensus_table:
        md_lines.append(f"| **{d.variable}** | {d.bulls_view} | {d.bears_view} | {d.evidence} |")
    md_lines.append("\n---\n")

    # 4. KẾT LUẬN & HÀNH ĐỘNG DÀNH CHO NHÀ ĐẦU TƯ
    md_lines.append("## 4. KẾT LUẬN & HÀNH ĐỘNG DÀNH CHO NHÀ ĐẦU TƯ\n")
    md_lines.append(f"- **Consensus Rating:** **{cs.consensus_rating}** (Điểm trung bình: {cs.consensus_score}/5.0).")
    md_lines.append(f"- **Vùng giá mục tiêu bình quân:**")
    if cs.average_upside < 0:
        mean_upside_str = f"Thị giá vượt định giá: **+{abs(cs.average_upside):.1f}%** (Đã vượt kỳ vọng)"
    else:
        mean_upside_str = f"Upside tiềm năng: **+{cs.average_upside:.1f}%**"
    md_lines.append(f"  - Giá bình quân (Mean): **{cs.mean_target_price:,.0f} VND** ({mean_upside_str}).")
    md_lines.append(f"  - Giá trung vị (Median): **{cs.median_target_price:,.0f} VND**.")
    md_lines.append(f"  - Khung giá mục tiêu [Min - Max]: **{cs.min_target_price:,.0f} - {cs.max_target_price:,.0f} VND** (Biên độ chênh lệch: {cs.target_price_spread_percent:.1f}%).")
    md_lines.append(f"- **Vùng giá giải ngân khuyến nghị:** `{cs.recommended_buy_zone}`.")
    md_lines.append(f"- **Ngưỡng quản trị rủi ro (Stop-loss):** `{cs.stop_loss_threshold}`.")
    md_lines.append(f"- **Trigger then chốt cần theo dõi định kỳ:**")
    for t in cs.key_triggers:
        md_lines.append(f"  * {t}")

    markdown_content = "\n".join(md_lines)
    return {"markdown": markdown_content}


@app.get("/api/reports/pdf/{ticker}/{institution}")
async def get_report_pdf(ticker: str, institution: str):
    """
    Trả về file PDF Báo cáo Phân tích & Định giá chuyên sâu của Công ty Chứng khoán tương ứng.
    Cho phép xem trực tiếp trên trình duyệt (inline) hoặc tải về (download).
    """
    clean_ticker = ticker.upper().strip()
    clean_inst = institution.removesuffix(".pdf").strip()

    # Tìm kiếm báo cáo trong PRESET_DATASETS hoặc gọi get_preset_by_ticker
    if clean_ticker in PRESET_DATASETS:
        full_report = PRESET_DATASETS[clean_ticker]
    else:
        full_report = await get_preset_by_ticker(clean_ticker, sync_live_price=False)

    matched_item = None
    for item in full_report.matrix_table:
        if clean_inst.lower() in item.institution.lower() or item.institution.lower() in clean_inst.lower():
            matched_item = item
            break

    if not matched_item and full_report.matrix_table:
        matched_item = full_report.matrix_table[0]

    # Nếu báo cáo có link PDF gốc thực tế (từ Vietstock eDocs, etc.), proxy trực tiếp nội dung PDF gốc
    if matched_item and matched_item.source_url and matched_item.source_url.startswith("http") and ".pdf" in matched_item.source_url.lower():
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/pdf,*/*"
            }
            async with httpx.AsyncClient(headers=headers, timeout=8.0, follow_redirects=True) as client:
                remote_resp = await client.get(matched_item.source_url)
                if remote_resp.status_code == 200 and (b"%PDF" in remote_resp.content[:1024] or len(remote_resp.content) > 1000):
                    safe_inst_name = (matched_item.institution or "CTCK").replace(" ", "_").replace("/", "_")
                    filename = f"{clean_ticker}_{safe_inst_name}_Bao_Cao_Phan_Tich.pdf"
                    return Response(
                        content=remote_resp.content,
                        media_type="application/pdf",
                        headers={
                            "Content-Disposition": make_content_disposition("inline", filename),
                            "Cache-Control": "public, max-age=3600"
                        }
                    )
        except Exception as proxy_err:
            print(f"Proxy real PDF error for {clean_ticker}: {proxy_err}. Fallback to PDF generator.")

    report_dict = {
        "institution": matched_item.institution if matched_item else clean_inst,
        "target_price": matched_item.target_price if matched_item else full_report.consensus_summary.mean_target_price,
        "current_price": full_report.consensus_summary.current_market_price,
        "upside_pct": matched_item.upside_percent if matched_item else full_report.consensus_summary.average_upside,
        "recommendation": matched_item.recommendation if matched_item else full_report.consensus_summary.consensus_rating,
        "date": matched_item.report_date if matched_item else "18/08/2026",
        "catalysts": " • " + "\n • ".join(matched_item.key_catalysts) if matched_item and matched_item.key_catalysts else "Triển vọng kinh doanh khả quan nhờ mở rộng công suất và nhu cầu thị trường hồi phục mạnh mẽ.",
        "risks": " • " + "\n • ".join(matched_item.key_risks) if matched_item and matched_item.key_risks else "Biến động chi phí nguyên vật liệu đầu vào và rủi ro tỷ giá.",
    }

    consensus_dict = {
        "avg_target": full_report.consensus_summary.mean_target_price,
        "avg_upside_pct": full_report.consensus_summary.average_upside,
        "highest_target": full_report.consensus_summary.max_target_price,
        "lowest_target": full_report.consensus_summary.min_target_price,
        "total_reports": len(full_report.matrix_table),
    }

    pdf_bytes = generate_ctck_report_pdf(
        ticker=clean_ticker,
        company_name=full_report.company_name,
        sector=full_report.sector,
        report=report_dict,
        consensus=consensus_dict,
    )

    safe_inst_name = report_dict["institution"].replace(" ", "_").replace("/", "_")
    filename = f"{clean_ticker}_{safe_inst_name}_Bao_Cao_Phan_Tich.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": make_content_disposition("inline", filename),
            "Cache-Control": "public, max-age=3600"
        }
    )


@app.post("/api/export-csv")
async def api_export_csv(req: ExportRequest):
    data = req.report_data
    reports = data.matrix_table
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    headers = ["Tieu_chi"] + [r.institution for r in reports]
    writer.writerow(headers)

    # Rows
    writer.writerow(["Ngay_phat_hanh"] + [r.report_date for r in reports])
    writer.writerow(["Khuyen_nghi"] + [r.recommendation for r in reports])
    writer.writerow(["Gia_muc_tieu"] + [f"{r.target_price:.0f}" for r in reports])
    writer.writerow(["Upside_percent"] + [f"{r.upside_percent:.1f}%" if r.upside_percent else "" for r in reports])
    writer.writerow(["PE_forward"] + [str(r.pe_forward or "") for r in reports])
    writer.writerow(["PB_forward"] + [str(r.pb_forward or "") for r in reports])
    writer.writerow(["Du_phong_Doanh_thu"] + [r.revenue_forecast for r in reports])
    writer.writerow(["Du_phong_LNST"] + [r.npat_forecast for r in reports])
    writer.writerow(["Phuong_phap_dinh_gia"] + [r.valuation_method or "" for r in reports])

    csv_content = output.getvalue()
    filename = f"IERM_{data.ticker}_Matrix.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": make_content_disposition("attachment", filename)}
    )


@app.post("/api/export-matrix-pdf")
async def api_export_matrix_pdf(req: ExportRequest):
    """
    Xuất toàn bộ Bảng đối chiếu trực diện đa tổ chức ra file PDF A4 Landscape định dạng chuyên nghiệp.
    """
    data = req.report_data
    report_dict = data.model_dump()
    pdf_bytes = generate_matrix_table_pdf(report_dict)
    filename = f"IERM_{data.ticker}_Matrix_Table.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": make_content_disposition("attachment", filename),
            "Cache-Control": "no-cache"
        }
    )


class PeerExportPdfRequest(BaseModel):
    peers_data: dict
    radar_image_base64: Optional[str] = None


@app.post("/api/peers/export-pdf")
async def api_export_peers_pdf(req: PeerExportPdfRequest):
    """
    Xuất Báo cáo đối thủ cùng ngành & Radar sức mạnh tài chính ra file PDF A4 Landscape định dạng chuẩn tổ chức.
    """
    target = (req.peers_data.get("target_ticker") or "DN").upper()
    raw_sector = req.peers_data.get("sector_name") or "Nganh"
    clean_sector = "".join(c for c in raw_sector if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    pdf_bytes = generate_peer_comparison_pdf(req.peers_data, req.radar_image_base64)
    filename = f"Bao_Cao_Nganh_{target}_{clean_sector}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": make_content_disposition("attachment", filename),
            "Cache-Control": "no-cache"
        }
    )


@app.post("/api/export-matrix-excel")
async def api_export_matrix_excel(req: ExportRequest):
    """
    Xuất Bảng đối chiếu đa tổ chức ra file Excel XML/HTML Spreadsheet (.xls)
    hỗ trợ 100% tiếng Việt UTF-8, định dạng màu sắc cột, tiêu đề, căn chỉnh số liệu chuẩn xác.
    """
    data = req.report_data
    reports = data.matrix_table
    cs = data.consensus_summary

    html_lines = [
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
        '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
        '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>',
        f'<x:Name>IERM_{data.ticker}_Matrix</x:Name>',
        '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->',
        '<style>',
        'body { font-family: "Segoe UI", Arial, sans-serif; }',
        'table { border-collapse: collapse; width: 100%; }',
        'th { background-color: #0f172a; color: #38bdf8; border: 1px solid #334155; padding: 8px; font-weight: bold; text-align: center; }',
        'td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }',
        '.header-row { background-color: #0284c7; color: #ffffff; font-weight: bold; }',
        '.criteria-col { background-color: #f8fafc; font-weight: bold; color: #1e293b; min-width: 220px; }',
        '.consensus-col { background-color: #f0fdf4; font-weight: bold; color: #059669; text-align: center; }',
        '</style></head><body>',
        f'<div style="background-color: #0f172a; padding: 12px 16px; border-radius: 4px; margin-bottom: 12px;">',
        f'  <div style="font-size: 11px; font-weight: normal; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase;">IERM TERMINAL // BẢNG ĐỐI CHIẾU TRỰC DIỆN ĐA TỔ CHỨC</div>',
        f'  <div style="font-size: 17px; font-weight: bold; color: #facc15; margin-top: 4px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);"><span style="color:#38bdf8;">Mã CK:</span> {data.ticker} - <span style="color:#ffffff;">{data.company_name}</span> | <span style="color:#94a3b8; font-size: 14px; font-weight: normal;">Ngành: {data.sector}</span></div>',
        f'  <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;"><b>Thị giá tham chiếu:</b> <span style="color:#38bdf8; font-weight:bold;">{cs.current_market_price:,.0f} VND</span> | <b>Định giá TB (Mean):</b> <span style="color:#4ade80; font-weight:bold;">{cs.mean_target_price:,.0f} VND</span> | <b>{"Kỳ vọng thị giá vs Định giá" if cs.average_upside < 0 else "Upside kỳ vọng"}:</b> <span style="color:{"#f43f5e" if cs.average_upside < 0 else "#22c55e"}; font-weight:bold;">{"Đã vượt kỳ vọng (+" + f"{abs(cs.average_upside):.1f}" + "%)" if cs.average_upside < 0 else f"+{cs.average_upside:.1f}%"}</span></div>',
        f'</div>',
        '<table border="1">'
    ]

    # Header
    html_lines.append('<tr>')
    html_lines.append('<th class="header-row" style="text-align:left;">TIÊU CHÍ ĐỐI CHIẾU</th>')
    for r in reports:
        html_lines.append(f'<th class="header-row">{r.institution}<br><span style="font-size:10px;font-weight:normal;">({r.report_date})</span></th>')
    html_lines.append('<th class="header-row" style="background-color:#059669;color:#ffffff;">CONSENSUS & ĐỒNG THUẬN</th>')
    html_lines.append('</tr>')

    def add_row(criteria, get_val_fn, consensus_str, is_bold=False):
        html_lines.append('<tr>')
        html_lines.append(f'<td class="criteria-col">{criteria}</td>')
        for r in reports:
            val = get_val_fn(r)
            b_tag = "<b>" if is_bold else ""
            b_end = "</b>" if is_bold else ""
            html_lines.append(f'<td style="text-align:center;">{b_tag}{val}{b_end}</td>')
        html_lines.append(f'<td class="consensus-col">{consensus_str}</td>')
        html_lines.append('</tr>')

    # 1. Khuyến nghị
    add_row("1. Khuyến nghị đầu tư", lambda r: r.recommendation, cs.consensus_rating, is_bold=True)
    # 2. Giá mục tiêu
    def _fmt_excel_tp(r):
        if getattr(r, "is_expired", False):
            return f"{r.target_price:,.0f} đ (Quá 1 năm)" if r.target_price > 0 else "— (Quá 1 năm)"
        if getattr(r, "is_technical", False):
            return "— (PTKT)"
        if not r.target_price or r.target_price <= 0:
            return "— (KQKD)"
        return f"{r.target_price:,.0f} đ"
    excel_cs_tp = f"Mean: {cs.mean_target_price:,.0f} đ" if cs.mean_target_price > 0 else "Mean: — (Cần theo dõi thêm)"
    add_row("2. Giá mục tiêu (VND)", _fmt_excel_tp, excel_cs_tp, is_bold=True)

    # 3. Tiềm năng tăng giá
    def _fmt_excel_upside(r):
        if getattr(r, "is_expired", False):
            return "— (Quá 1 năm)"
        if r.upside_percent is None: return "—"
        if r.upside_percent < 0: return f"Vượt +{abs(r.upside_percent):.1f}%"
        return f"+{r.upside_percent:.1f}%"
    if cs.mean_target_price <= 0:
        excel_cs_up = "— (Cần theo dõi thêm)"
    elif cs.average_upside < 0:
        excel_cs_up = f"Đã vượt kỳ vọng (+{abs(cs.average_upside):.1f}%)"
    else:
        excel_cs_up = f"+{cs.average_upside:.1f}%"
    add_row("3. Tiềm năng tăng giá (Upside)", _fmt_excel_upside, excel_cs_up, is_bold=True)
    # 4. P/E forward
    valid_pes = [r.pe_forward for r in reports if r.pe_forward and r.pe_forward > 0]
    avg_pe = sum(valid_pes) / len(valid_pes) if valid_pes else 0
    add_row("4. Hệ số P/E Forward", lambda r: f"{r.pe_forward:.1f}x" if r.pe_forward else "—", f"TB: {avg_pe:.1f}x" if avg_pe > 0 else "—")
    # 5. P/B forward
    valid_pbs = [r.pb_forward for r in reports if r.pb_forward and r.pb_forward > 0]
    avg_pb = sum(valid_pbs) / len(valid_pbs) if valid_pbs else 0
    add_row("5. Hệ số P/B Forward", lambda r: f"{r.pb_forward:.2f}x" if r.pb_forward else "—", f"TB: {avg_pb:.2f}x" if avg_pb > 0 else "—")
    # 6. Dự phóng Doanh thu
    add_row("6. Dự phóng Doanh thu", lambda r: r.revenue_forecast or "N/A", "Đồng thuận tích cực")
    # 7. Dự phóng LNST
    add_row("7. Dự phóng LNST", lambda r: r.npat_forecast or "N/A", "Tăng trưởng cao", is_bold=True)
    # 8. Luận điểm tăng trưởng
    add_row("8. Luận điểm tăng trưởng (Catalysts)", lambda r: "<br>• ".join([""] + (r.key_catalysts or [])), "• Dự án mở rộng công suất<br>• Tăng trưởng thị phần")
    # 9. Rủi ro trọng yếu
    add_row("9. Rủi ro trọng yếu (Key Risks)", lambda r: "<br>• ".join([""] + (r.key_risks or [])), "• Biến động giá hàng hóa<br>• Rủi ro tài chính")

    html_lines.append('</table><br>')
    html_lines.append(f'<p><b>Chiến lược giải ngân:</b> {cs.recommended_buy_zone} | <b>Ngưỡng quản trị dừng lỗ:</b> {cs.stop_loss_threshold}</p>')
    html_lines.append('</body></html>')

    excel_content = "\n".join(html_lines)
    filename = f"IERM_{data.ticker}_Matrix_Table.xls"
    return Response(
        content=excel_content,
        media_type="application/vnd.ms-excel",
        headers={"Content-Disposition": make_content_disposition("attachment", filename)}
    )


