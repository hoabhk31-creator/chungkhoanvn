"""
Institutional Equity Research Matrix (IERM) - Automated Verification Suite
"""

import unittest
from engine import (
    ReportItem,
    calculate_consensus,
    extract_financial_data_from_text,
    PRESET_DATASETS
)
from server import app
from starlette.testclient import TestClient


class TestIERM(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_presets_integrity(self):
        """Kiểm tra tính toàn vẹn của các bộ dữ liệu mẫu đa tổ chức HPG, FPT, MWG, HCM, GEX, PDR"""
        self.assertIn("HPG", PRESET_DATASETS)
        self.assertIn("FPT", PRESET_DATASETS)
        self.assertIn("MWG", PRESET_DATASETS)
        self.assertIn("HCM", PRESET_DATASETS)
        self.assertIn("GEX", PRESET_DATASETS)
        self.assertIn("PDR", PRESET_DATASETS)

        hpg = PRESET_DATASETS["HPG"]
        self.assertEqual(hpg.ticker, "HPG")
        self.assertEqual(len(hpg.matrix_table), 6)  # 6 CTCK: SSI, HSC, Vietcap, VNDirect, MAS, VCBS
        self.assertGreater(hpg.consensus_summary.mean_target_price, 30000)
        self.assertGreater(len(hpg.causality_analysis), 0)
        self.assertGreater(len(hpg.disensus_table), 0)

        hcm = PRESET_DATASETS["HCM"]
        self.assertEqual(hcm.ticker, "HCM")
        self.assertEqual(len(hcm.matrix_table), 5)  # 5 CTCK: SSI, Vietcap, VNDirect, MAS, VCBS
        self.assertGreater(hcm.consensus_summary.mean_target_price, 30000)

    def test_hcm_full_bundle(self):
        """Kiểm tra mã HCM (khoanh đỏ số 1) nạp đầy đủ dữ liệu cho cả 6 tabs mà không bị thiếu mục nào"""
        resp_preset = self.client.get("/api/preset/HCM")
        self.assertEqual(resp_preset.status_code, 200)
        p_data = resp_preset.json()
        self.assertEqual(p_data["ticker"], "HCM")
        self.assertIn("HSC", p_data["company_name"])
        self.assertGreater(len(p_data["matrix_table"]), 0)

        resp_fin = self.client.get("/api/financial-overview/HCM")
        self.assertEqual(resp_fin.status_code, 200)
        f_data = resp_fin.json()
        self.assertEqual(f_data["company_profile"]["ticker"], "HCM")
        self.assertEqual(len(f_data["dupont"]), 9)  # Dupont fields
        self.assertEqual(len(f_data["piotroski"]["criteria"]), 9)
        self.assertIn("statements_annual", f_data)
        self.assertGreater(len(f_data["statements_annual"]["revenue"]), 0)

        resp_tech = self.client.get("/api/technical/HCM")
        self.assertEqual(resp_tech.status_code, 200)
        t_data = resp_tech.json()
        self.assertEqual(t_data["ticker"], "HCM")
        self.assertGreater(len(t_data["candles_history"]), 0)

    def test_lhg_company_name_and_sector(self):
        """Kiểm tra mã LHG hiển thị đúng tên CTCP Long Hậu và ngành Bất động sản Khu công nghiệp"""
        resp_preset = self.client.get("/api/preset/LHG")
        self.assertEqual(resp_preset.status_code, 200)
        p_data = resp_preset.json()
        self.assertEqual(p_data["ticker"], "LHG")
        self.assertIn("Long Hậu", p_data["company_name"])
        self.assertIn("Khu công nghiệp", p_data["sector"])
        self.assertNotEqual(p_data["sector"], "Doanh nghiệp niêm yết")

        resp_fin = self.client.get("/api/financial-overview/LHG")
        self.assertEqual(resp_fin.status_code, 200)
        f_data = resp_fin.json()
        self.assertIn("Long Hậu", f_data["company_profile"]["name"])
        self.assertIn("Khu công nghiệp", f_data["company_profile"]["sector"])

    def test_consensus_calculator(self):
        """Kiểm tra bộ tính toán Consensus và Disensus"""
        reports = [
            ReportItem(
                institution="CTCK A",
                report_date="01/08/2026",
                recommendation="MUA",
                target_price=40000,
                current_price_at_report=30000,
                pe_forward=12.0,
                revenue_forecast="100,000 tỷ",
                npat_forecast="10,000 tỷ",
                key_catalysts=["Mở rộng thị phần"],
                key_risks=["Tỷ giá"]
            ),
            ReportItem(
                institution="CTCK B",
                report_date="05/08/2026",
                recommendation="KHẢ QUAN",
                target_price=36000,
                current_price_at_report=30000,
                pe_forward=13.0,
                revenue_forecast="95,000 tỷ",
                npat_forecast="9,200 tỷ",
                key_catalysts=["Tiết giảm chi phí"],
                key_risks=["Lãi suất"]
            ),
            ReportItem(
                institution="CTCK C",
                report_date="10/08/2026",
                recommendation="NẮM GIỮ",
                target_price=32000,
                current_price_at_report=30000,
                pe_forward=14.0,
                revenue_forecast="90,000 tỷ",
                npat_forecast="8,500 tỷ",
                key_catalysts=["Đầu tư công"],
                key_risks=["Cạnh tranh"]
            )
        ]

        result = calculate_consensus(reports, ticker="TEST", current_market_price=30000)
        cs = result.consensus_summary

        self.assertEqual(cs.mean_target_price, 36000)
        self.assertEqual(cs.median_target_price, 36000)
        self.assertEqual(cs.min_target_price, 32000)
        self.assertEqual(cs.max_target_price, 40000)
        self.assertAlmostEqual(cs.average_upside, 20.0, places=1)
        self.assertGreater(len(result.disensus_table), 0)

    def test_market_tape_api(self):
        """Kiểm tra API bảng giá thị trường live cho dải Ticker Tape (Khoanh đỏ số 3)"""
        resp = self.client.get("/api/market-tape?ticker=HCM")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("indices", data)
        self.assertIn("stocks", data)
        self.assertGreater(len(data["indices"]), 0)
        self.assertGreater(len(data["stocks"]), 0)
        symbols = [s["symbol"] for s in data["stocks"]]
        self.assertIn("HCM", symbols)

    def test_benchmark_recommendations_api(self):
        """Kiểm tra API danh sách khuyến nghị CTCK cho thanh chip tiêu biểu (Khoanh đỏ số 2)"""
        resp = self.client.get("/api/benchmark-recommendations")
        self.assertEqual(resp.status_code, 200)
        list_rec = resp.json()
        self.assertEqual(len(list_rec), 8)
        tickers = [x["ticker"] for x in list_rec]
        self.assertIn("HPG", tickers)
        self.assertIn("HCM", tickers)
        self.assertIn("SSI", tickers)
        for item in list_rec:
            self.assertIn("rating", item)
            self.assertIn("upside", item)

    def test_api_health_and_presets(self):
        """Kiểm tra API health check và presets"""
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "online")

        resp2 = self.client.get("/api/presets")
        self.assertEqual(resp2.status_code, 200)
        presets = resp2.json()
        self.assertGreaterEqual(len(presets), 8)

        resp3 = self.client.get("/api/preset/HPG")
        self.assertEqual(resp3.status_code, 200)
        hpg_data = resp3.json()
        self.assertEqual(hpg_data["ticker"], "HPG")

    def test_api_search(self):
        """Kiểm tra API tìm kiếm báo cáo"""
        resp = self.client.get("/api/search?ticker=HPG")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreater(data["total_found"], 0)

    def test_api_raw_text_analysis(self):
        """Kiểm tra bóc tách văn bản thô tiếng Việt"""
        raw_text = """
        Báo cáo phân tích SSI Research phát hành ngày 15/08/2026.
        Khuyến nghị: MUA
        Giá mục tiêu: 38,500 đồng/cp.
        P/E forward: 11.5x. P/B forward: 1.6x.
        Doanh thu kỳ vọng: 170,000 tỷ VND (+22% YoY).
        LNST dự phóng: 16,000 tỷ VND (+40% YoY).
        Luận điểm then chốt:
        - Đưa lò cao Dung Quất 2 vào hoạt động đúng kế hoạch.
        - Biên lợi nhuận gộp hồi phục mạnh nhờ giá quặng sắt giảm.
        - Hưởng lợi từ chính sách phòng vệ thương mại chống bán phá giá.
        Rủi ro trọng yếu:
        - Thị trường bất động sản hồi phục chậm.
        - Biến động tỷ giá USD/VND.
        """
        resp = self.client.post("/api/analyze-raw", json={"raw_text": raw_text, "institution": "SSI"})
        self.assertEqual(resp.status_code, 200)
        item = resp.json()
        self.assertEqual(item["institution"], "SSI")
        self.assertEqual(item["recommendation"], "MUA")
        self.assertEqual(item["target_price"], 38500)
        self.assertEqual(item["pe_forward"], 11.5)
        self.assertIn("16,000", item["npat_forecast"])

    def test_api_export_markdown_and_csv(self):
        """Kiểm tra tính năng xuất Markdown và CSV đúng chuẩn 4 phần của prompt"""
        hpg = PRESET_DATASETS["HPG"].model_dump()
        resp = self.client.post("/api/export-markdown", json={"report_data": hpg})
        self.assertEqual(resp.status_code, 200)
        md = resp.json()["markdown"]

        # Kiểm tra sự hiện diện của đầy đủ 4 phần
        self.assertIn("1. BẢNG MA TRẬN SO SÁNH ĐA TỔ CHỨC", md)
        self.assertIn("2. PHÂN TÍCH CHUYÊN SÂU: NGUYÊN NHÂN - KẾT QUẢ - BẰNG CHỨNG", md)
        self.assertIn("3. BẢNG PHÂN HÓA QUAN ĐIỂM (DISENSUS & CONSENSUS ANALYSIS)", md)
        self.assertIn("4. KẾT LUẬN & HÀNH ĐỘNG DÀNH CHO NHÀ ĐẦU TƯ", md)

        # Kiểm tra CSV
        resp_csv = self.client.post("/api/export-csv", json={"report_data": hpg})
        self.assertEqual(resp_csv.status_code, 200)
        self.assertIn("text/csv", resp_csv.headers["content-type"])
        self.assertIn("SSI Research", resp_csv.text)

    def test_api_live_price(self):
        """Kiểm tra API lấy giá đóng cửa từ Vietstock Chart và CTCKs"""
        resp = self.client.get("/api/live-price/HPG")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["ticker"], "HPG")
        self.assertGreater(data["latest_close"], 0)
        self.assertIn("selected_source", data)
        self.assertGreater(len(data["sources_comparison"]), 0)


    def test_api_financial_overview(self):
        """Kiểm tra API phân tích BCTC, Dupont, Piotroski, Z-score, DCF"""
        resp = self.client.get("/api/financial-overview/HPG")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["ticker"], "HPG")
        self.assertIn("dupont", data)
        self.assertIn("piotroski", data)
        self.assertIn("altman_z", data)
        self.assertIn("statements_annual", data)
        self.assertIn("peers_data", data)
        self.assertIn("valuation", data)

        # Check Piotroski score criteria count
        self.assertEqual(len(data["piotroski"]["criteria"]), 9)
        # Check Altman Z score is safe or grey
        self.assertIn(data["altman_z"]["color"], ["emerald", "amber"])

    def test_api_interactive_dcf(self):
        """Kiểm tra API định giá DCF tùy biến tương tác"""
        req_body = {
            "ticker": "HPG",
            "wacc": 11.5,
            "terminal_g": 2.5,
            "fcf_growth_rate": 15.0
        }
        resp = self.client.post("/api/valuation/dcf", json=req_body)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["ticker"], "HPG")
        self.assertGreater(data["dcf_fair_value"], 0)
        self.assertIn("margin_of_safety_percent", data)

    def test_api_crawl_url_and_synthesis(self):
        """Kiểm tra API bóc tách dữ liệu từ link URL (Web/PDF) và cơ chế tổng hợp tự động"""
        resp = self.client.post("/api/crawl-url", json={
            "url": "https://finance.vietstock.vn/TCH/bao-cao-phan-tich.htm",
            "ticker": "TCH",
            "institution": "SSI Research"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("extracted_report", data)
        rep = data["extracted_report"]
        self.assertEqual(rep["institution"], "SSI")
        self.assertGreater(rep["target_price"], 0)
        self.assertGreater(len(rep["key_catalysts"]), 0)
        self.assertGreater(len(rep["key_risks"]), 0)

    def test_api_preset_dynamic_ticker(self):
        """Kiểm tra API tự động tổng hợp báo cáo đa tổ chức cho mã bất kỳ ngoài preset (VD: TCH)"""
        resp = self.client.get("/api/preset/TCH")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["ticker"], "TCH")
        self.assertGreaterEqual(len(data["matrix_table"]), 3)
        self.assertGreater(data["consensus_summary"]["mean_target_price"], 0)
        self.assertGreater(len(data["causality_analysis"]), 0)
        self.assertGreater(len(data["disensus_table"]), 0)

    def test_api_analyze_raw_text(self):
        """Kiểm tra trích xuất chỉ số định lượng từ văn bản thô báo cáo CTCK"""
        sample_text = """
        BÁO CÁO PHÂN TÍCH SSI RESEARCH - CỔ PHIẾU HPG
        Khuyến nghị: MUA MẠNH
        Giá mục tiêu: 39,000 VND
        Thị giá hiện tại: 21,700 VND
        P/E Forward: 11.5x
        LNST dự phóng: 16,200 tỷ VND (+38% YoY)
        Luận điểm:
        - Dung Quất 2 chạy thử thương mại
        - Hưởng lợi thuế chống bán phá giá HRC
        Rủi ro:
        - Bất động sản dân dụng phục hồi chậm
        """
        resp = self.client.post("/api/analyze-raw", json={
            "raw_text": sample_text,
            "ticker": "HPG",
            "institution": "SSI Research"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["institution"], "SSI")
        self.assertEqual(data["recommendation"], "MUA MẠNH")
        self.assertEqual(data["target_price"], 39000.0)
        self.assertEqual(data["pe_forward"], 11.5)

    def test_api_upload_pdf(self):
        """Kiểm tra upload file PDF và trích xuất qua PyPDF"""
        pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 200 >>\nstream\nBT /F1 12 Tf 100 700 Td (BAO CAO SSI: HPG MUA GIA MUC TIEU 38000 VND PE 11.5) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000214 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n465\n%%EOF"
        resp = self.client.post(
            "/api/upload-pdf",
            files={"file": ("report.pdf", pdf_content, "application/pdf")},
            data={"ticker": "HPG", "institution": "SSI"}
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("extracted_report", data)
        self.assertGreater(data["extracted_report"]["target_price"], 0)

    def test_api_get_report_pdf(self):
        """Kiểm tra xuất file PDF báo cáo phân tích của CTCK (SSI, HSC, Vietcap...)"""
        # 1. Kiểm tra xuất PDF cho HPG / SSI
        resp = self.client.get("/api/reports/pdf/HPG/SSI.pdf")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["content-type"], "application/pdf")
        self.assertTrue(resp.content.startswith(b"%PDF-"))
        self.assertIn("inline; filename=", resp.headers.get("content-disposition", ""))

        # 2. Kiểm tra xuất PDF cho FPT / Vietcap
        resp_fpt = self.client.get("/api/reports/pdf/FPT/Vietcap.pdf")
        self.assertEqual(resp_fpt.status_code, 200)
        self.assertEqual(resp_fpt.headers["content-type"], "application/pdf")
        self.assertTrue(resp_fpt.content.startswith(b"%PDF-"))

        # 3. Kiểm tra mã mới bất kỳ (dynamically generated report)
        resp_dynamic = self.client.get("/api/reports/pdf/TCB/SSI.pdf")
        self.assertEqual(resp_dynamic.status_code, 200)
        self.assertEqual(resp_dynamic.headers["content-type"], "application/pdf")
        self.assertTrue(resp_dynamic.content.startswith(b"%PDF-"))

    def test_peers_comparison_sector_alignment(self):
        """Kiểm tra bảng đối thủ cùng ngành phân loại chính xác, không bị lẫn ngành khác (VD: LHG chỉ có KBC, IDC, SZC, BCM)"""
        # 1. Test qua financial-overview
        resp = self.client.get("/api/financial-overview/LHG")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        peers_data = data["peers_data"]
        self.assertEqual(peers_data["target_ticker"], "LHG")
        self.assertIn("Khu công nghiệp", peers_data["sector_name"])
        
        peer_tickers = [p["ticker"] for p in peers_data["peers"]]
        self.assertEqual(peer_tickers[0], "LHG")  # Target ticker luôn đứng đầu tiên
        self.assertIn("KBC", peer_tickers)
        self.assertTrue(any(t in ["SZC", "IDC", "BCM", "VGC"] for t in peer_tickers))
        
        # Tuyệt đối không lẫn ngành khác như SSI, HPG, VNM
        self.assertNotIn("SSI", peer_tickers)
        self.assertNotIn("HPG", peer_tickers)
        self.assertNotIn("VNM", peer_tickers)

        # Kiểm tra vốn hóa LHG >= 1,000 tỷ VND (để hiển thị 1.3k tỷ thay vì 0.0k tỷ)
        lhg_peer = next(p for p in peers_data["peers"] if p["ticker"] == "LHG")
        self.assertGreaterEqual(lhg_peer["market_cap_bil"], 1000.0)

        # 2. Test qua direct peers API /api/peers/LHG
        resp_peers = self.client.get("/api/peers/LHG")
        self.assertEqual(resp_peers.status_code, 200)
        p_data = resp_peers.json()
        self.assertEqual(p_data["target_ticker"], "LHG")
        self.assertEqual(p_data["peers"][0]["ticker"], "LHG")
        self.assertNotIn("SSI", [p["ticker"] for p in p_data["peers"]])
        self.assertNotIn("HPG", [p["ticker"] for p in p_data["peers"]])

    def test_peers_export_pdf_vietnamese_sectors(self):
        """Kiểm tra xuất file PDF đối thủ cùng ngành với tên ngành tiếng Việt có dấu (VND, VCB, HPG, DXG) không bị lỗi HTTP 500 latin-1."""
        test_cases = [
            ("VND", "Môi giới chứng khoán"),
            ("VCB", "Ngân hàng"),
            ("HPG", "Thép và sản phẩm thép"),
            ("DXG", "Bất động sản dân cư"),
        ]
        for ticker, sector in test_cases:
            payload = {
                "peers_data": {
                    "target_ticker": ticker,
                    "sector_name": sector,
                    "peers": [
                        {"ticker": ticker, "name": f"DN {ticker}", "market_cap_bil": 30000, "pe": 12.5, "pb": 1.6, "roe": 15.2, "roa": 4.5, "net_margin": 20.1, "debt_to_equity": 0.8}
                    ],
                    "industry_average": {"pe": 13.0, "pb": 1.7, "roe": 14.0, "roa": 4.0, "net_margin": 18.0, "debt_to_equity": 1.0}
                }
            }
            resp = self.client.post("/api/peers/export-pdf", json=payload)
            self.assertEqual(resp.status_code, 200, f"Failed for {ticker} with sector '{sector}': {resp.status_code}")
            self.assertEqual(resp.headers["content-type"], "application/pdf")
            self.assertTrue(resp.content.startswith(b"%PDF"))
            self.assertGreater(len(resp.content), 10000)
            self.assertIn("attachment; filename=", resp.headers.get("content-disposition", ""))


    def test_acb_institutional_reports_sector_accuracy(self):
        """
        Kiểm tra mã ACB (Ngân hàng TMCP Á Châu):
        1. Luận điểm then chốt (catalysts) và Rủi ro (risks) chuẩn ngành Ngân hàng (tín dụng, NIM, CASA, CAR, nợ xấu).
        2. TUYỆT ĐỐI KHÔNG chứa thuật ngữ ngành sản xuất công nghiệp ("công suất", "chuỗi cung ứng", "nguyên vật liệu", "xuất khẩu").
        3. Có đường link tra cứu báo cáo phân tích và ngày phát hành (report_date).
        """
        resp = self.client.get("/api/preset/ACB")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["ticker"], "ACB")
        self.assertIn("Ngân hàng", data["sector"])
        
        matrix = data["matrix_table"]
        self.assertGreater(len(matrix), 0)

        # Kiểm tra từng báo cáo trong ma trận
        manufacturing_forbidden_words = ["công suất", "chuỗi cung ứng", "nguyên vật liệu", "xuất khẩu"]
        for rep in matrix:
            self.assertTrue(rep["report_date"])
            self.assertTrue(rep["source_url"])
            
            combined_text = " ".join(rep["key_catalysts"] + rep["key_risks"]).lower()
            for word in manufacturing_forbidden_words:
                self.assertNotIn(word, combined_text, f"Từ cấm '{word}' xuất hiện trong báo cáo ACB: {combined_text}")

            # Kiểm tra chứa ít nhất một thuật ngữ ngành ngân hàng
            banking_terms = ["tín dụng", "nim", "casa", "car", "nợ xấu", "lãi", "tài chính", "dự phòng"]
            has_banking_term = any(term in combined_text for term in banking_terms)
            self.assertTrue(has_banking_term, f"Báo cáo ACB không chứa thuật ngữ ngân hàng: {combined_text}")

    def test_corporate_capital_standardization_dbc(self):
        """
        Kiểm tra chuẩn hóa và đồng bộ số liệu vốn hóa, số CP lưu hành / niêm yết,
        cơ cấu tỷ lệ sở hữu, và tỷ suất cổ tức cho DBC và HPG.
        """
        resp = self.client.get("/api/financial-overview/DBC")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        profile = data["company_profile"]

        # 1. Số CP lưu hành & Niêm yết của DBC (chuẩn hóa đạt ~384.87 triệu CP thay vì 334 triệu CP cũ)
        self.assertAlmostEqual(profile["shares_outstanding_mil"], 384.87, delta=1.0)
        self.assertAlmostEqual(profile["shares_listed_mil"], 384.87, delta=1.0)

        # 2. Cơ cấu tỷ lệ sở hữu (Nước ngoài ~1.49%, Trong nước ~98.51% thay vì 22.5% mặc định)
        self.assertLess(profile["foreign_ownership_pct"], 5.0)
        self.assertAlmostEqual(profile["foreign_ownership_pct"], 1.49, delta=0.5)
        self.assertGreater(profile["domestic_ownership_pct"], 95.0)

        # 3. Tỷ suất cổ tức (Yield)
        self.assertGreaterEqual(profile["dividend_yield_pct"], 1.5)

        # 4. Vốn hóa thị trường phải được đồng bộ chính xác với thị giá live
        expected_mcap = round((profile["shares_outstanding_mil"] * profile["current_market_price"]) / 1000.0, 1)
        self.assertEqual(profile["market_cap_bil"], expected_mcap)

    def test_corporate_database_endpoints(self):
        """
        Kiểm tra cơ sở dữ liệu hơn 650+ doanh nghiệp niêm yết từ Google Sheets:
        1. API /api/database/companies: trả về hơn 650 doanh nghiệp, hỗ trợ lọc theo keyword và ngành.
        2. API /api/database/companies/{ticker}: trả về thông tin chi tiết (DBC, HPG, LHG).
        3. API /api/database/sectors: trả về 34 phân ngành kinh tế với tỷ lệ bao phủ và tăng trưởng.
        """
        # 1. Danh sách doanh nghiệp
        resp = self.client.get("/api/database/companies?limit=10")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(data["total_database_records"], 650)
        self.assertEqual(len(data["companies"]), 10)

        # 2. Tìm kiếm theo keyword 'DBC'
        resp_dbc = self.client.get("/api/database/companies?q=DBC")
        self.assertEqual(resp_dbc.status_code, 200)
        dbc_data = resp_dbc.json()
        self.assertGreaterEqual(len(dbc_data["companies"]), 1)
        dbc_item = next(c for c in dbc_data["companies"] if c["ticker"] == "DBC")
        self.assertEqual(dbc_item["exchange"], "HOSE")
        self.assertIn("Chăn nuôi", dbc_item["fiintrade_sector"])

        # 3. Tra cứu chi tiết HPG
        resp_hpg = self.client.get("/api/database/companies/HPG")
        self.assertEqual(resp_hpg.status_code, 200)
        hpg_item = resp_hpg.json()
        self.assertEqual(hpg_item["ticker"], "HPG")
        self.assertEqual(hpg_item["exchange"], "HOSE")
        self.assertIn("Thép", hpg_item["icb4"])

        # 4. Tra cứu danh mục phân ngành
        resp_sec = self.client.get("/api/database/sectors")
        self.assertEqual(resp_sec.status_code, 200)
        sec_data = resp_sec.json()
        self.assertGreaterEqual(sec_data["total_sectors"], 30)
        sec_names = [s["sector_name"] for s in sec_data["sectors"]]
        self.assertIn("Ngân hàng", sec_names)
        self.assertIn("Bất động sản", sec_names)

    def test_quarterly_financial_statements(self):
        """
        Kiểm tra tính năng Báo cáo Quý (vị trí 1):
        API /api/financial-overview/{ticker} phải trả về trường statements_quarterly
        gồm 4 quý gần nhất ('Q2/2025', 'Q3/2025', 'Q4/2025', 'Q1/2026') với đầy đủ doanh thu & LNST.
        """
        resp = self.client.get("/api/financial-overview/HPG")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("statements_annual", data)
        self.assertIn("statements_quarterly", data)
        
        sq = data["statements_quarterly"]
        self.assertGreaterEqual(len(sq["periods"]), 4)
        self.assertIn("Q2/2026", sq["periods"])
        self.assertEqual(len(sq["revenue"]), len(sq["periods"]))
        self.assertEqual(len(sq["net_profit"]), len(sq["periods"]))
        self.assertEqual(len(sq["total_assets"]), len(sq["periods"]))
        self.assertEqual(len(sq["owner_equity"]), len(sq["periods"]))

    def test_hag_agricultural_sector_and_peers_accuracy(self):
        """
        Kiểm tra khắc phục lỗi so sánh đối thủ cùng ngành cho mã HAG (vị trí 2 & mũi tên 2):
        1. Ngành của HAG phải là Nông sản / Nông sản & Chăn nuôi.
        2. Đối thủ peers tuyệt đối không được rơi vào nhóm Bất động sản (VHM, KDH, NLG, PDR).
        3. Đối thủ peers phải là các doanh nghiệp cùng ngành nông nghiệp, chăn nuôi, thực phẩm (DBC, BAF, HNG, MML...).
        """
        resp = self.client.get("/api/financial-overview/HAG")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        
        # 1. Kiểm tra ngành của HAG
        sec = data["company_profile"]["sector"]
        self.assertTrue(any(k in sec.lower() for k in ["nông", "chăn nuôi"]), f"Ngành HAG không chuẩn: {sec}")
        
        # 2. Kiểm tra danh sách đối thủ
        peers_data = data["peers_data"]
        peer_tickers = [p["ticker"] for p in peers_data["peers"]]
        self.assertEqual(peer_tickers[0], "HAG", "Mã đang tra cứu phải ở vị trí đầu tiên")
        
        # Tuyệt đối không chứa các mã Bất động sản
        real_estate_forbidden = ["VHM", "KDH", "NLG", "PDR", "DXG", "DIG", "NVL"]
        for bds_tick in real_estate_forbidden:
            self.assertNotIn(bds_tick, peer_tickers, f"Mã BĐS '{bds_tick}' không được xuất hiện trong đối thủ của HAG!")
            
        # Phải chứa các mã nông sản, chăn nuôi, thực phẩm
        agri_peers = ["DBC", "BAF", "HNG", "MML", "PAN", "VHC", "ANV"]
        matching_count = sum(1 for t in peer_tickers[1:] if t in agri_peers)
        self.assertGreaterEqual(matching_count, 3, f"Phải có ít nhất 3 đối thủ nông sản/chăn nuôi, hiện có: {peer_tickers}")

    def test_peer_comparison_expanded_all_peers(self):
        """
        Kiểm tra mở rộng bảng đối thủ cùng ngành:
        Không còn giới hạn 5 mã, phải hiển thị đầy đủ tất cả doanh nghiệp đầu ngành (> 8 mã).
        """
        # 1. Ngân hàng (VCB)
        resp_vcb = self.client.get("/api/financial-overview/VCB")
        self.assertEqual(resp_vcb.status_code, 200)
        vcb_peers = resp_vcb.json()["peers_data"]["peers"]
        self.assertGreaterEqual(len(vcb_peers), 10, "Nhóm ngân hàng phải có >= 10 mã đối thủ")

        # 2. Dầu khí & Năng lượng (GAS)
        resp_gas = self.client.get("/api/financial-overview/GAS")
        self.assertEqual(resp_gas.status_code, 200)
        gas_peers = resp_gas.json()["peers_data"]["peers"]
        self.assertGreaterEqual(len(gas_peers), 8, "Nhóm dầu khí phải có >= 8 mã đối thủ")

        # 3. BĐS Khu công nghiệp (KBC)
        resp_kbc = self.client.get("/api/financial-overview/KBC")
        self.assertEqual(resp_kbc.status_code, 200)
        kbc_peers = resp_kbc.json()["peers_data"]["peers"]
        self.assertGreaterEqual(len(kbc_peers), 8, "Nhóm KCN phải có >= 8 mã đối thủ")

        # 4. Chứng khoán (SSI) - Mã trong PRESET vẫn phải hiển thị đầy đủ >= 10 đối thủ như VIX
        resp_ssi = self.client.get("/api/financial-overview/SSI")
        self.assertEqual(resp_ssi.status_code, 200)
        ssi_pd = resp_ssi.json()["peers_data"]
        self.assertGreaterEqual(len(ssi_pd["peers"]), 10, "SSI phải có >= 10 mã đối thủ ngành chứng khoán")
        self.assertIn("sector_kpi_columns", ssi_pd)
        ssi_kpi_fields = [c["field"] for c in ssi_pd["sector_kpi_columns"]]
        self.assertIn("margin_loan_bil", ssi_kpi_fields)
        self.assertEqual(ssi_pd["peers"][0]["ticker"], "SSI")
        self.assertIn("VIX", [p["ticker"] for p in ssi_pd["peers"]])

    def test_peer_comparison_sector_kpis(self):
        """
        Kiểm tra chỉ số KPI đặc thù theo từng ngành:
        1. Ngân hàng: NIM, CASA, NPL, Tín dụng, CAR
        2. BĐS KCN: Tỷ lệ lấp đầy, Giá thuê đất, DT trả trước
        3. BĐS Dân dụng: Tiền người mua trả trước, Backlog
        4. Dầu khí: EBITDA Margin, Capex/Doanh thu
        """
        # 1. Ngân hàng VCB
        resp_vcb = self.client.get("/api/financial-overview/VCB")
        self.assertEqual(resp_vcb.status_code, 200)
        vcb_pd = resp_vcb.json()["peers_data"]
        self.assertIn("sector_kpi_columns", vcb_pd)
        kpi_fields = [col["field"] for col in vcb_pd["sector_kpi_columns"]]
        self.assertIn("nim_percent", kpi_fields)
        self.assertIn("casa_percent", kpi_fields)
        self.assertIn("npl_percent", kpi_fields)
        # Kiểm tra dữ liệu cụ thể của VCB
        vcb_self = vcb_pd["peers"][0]
        self.assertIsNotNone(vcb_self.get("nim_percent"))
        self.assertGreater(vcb_self.get("nim_percent"), 2.0)
        self.assertIsNotNone(vcb_self.get("casa_percent"))

        # 2. BĐS Dân dụng VHM
        resp_vhm = self.client.get("/api/financial-overview/VHM")
        self.assertEqual(resp_vhm.status_code, 200)
        vhm_pd = resp_vhm.json()["peers_data"]
        vhm_kpi_fields = [col["field"] for col in vhm_pd["sector_kpi_columns"]]
        self.assertIn("advance_from_buyers_bil", vhm_kpi_fields)
        self.assertIn("backlog_bil", vhm_kpi_fields)
        vhm_self = vhm_pd["peers"][0]
        self.assertIsNotNone(vhm_self.get("advance_from_buyers_bil"))
        self.assertGreater(vhm_self.get("advance_from_buyers_bil"), 10000)

        # 3. Dầu khí GAS
        resp_gas = self.client.get("/api/financial-overview/GAS")
        self.assertEqual(resp_gas.status_code, 200)
        gas_pd = resp_gas.json()["peers_data"]
        gas_kpi_fields = [col["field"] for col in gas_pd["sector_kpi_columns"]]
        self.assertIn("ebitda_margin", gas_kpi_fields)
        self.assertIn("capex_rev_ratio", gas_kpi_fields)
        gas_self = gas_pd["peers"][0]
        self.assertIsNotNone(gas_self.get("ebitda_margin"))

    def test_industry_reports_endpoint(self):
        """Kiểm tra endpoint /api/industry-reports trả về đúng định dạng, liên kết ngành & hàng hóa và link PDF"""
        # 1. Test với HPG (Ngành Thép & Kim loại)
        resp_hpg = self.client.get("/api/industry-reports?ticker=HPG")
        self.assertEqual(resp_hpg.status_code, 200)
        data_hpg = resp_hpg.json()
        self.assertEqual(data_hpg["ticker"], "HPG")
        self.assertIn("Thép", data_hpg["sector_name"])
        self.assertGreaterEqual(len(data_hpg["commodities"]), 2)
        self.assertGreater(data_hpg["total_found"], 0)
        self.assertGreater(len(data_hpg["reports"]), 0)

        first_rep = data_hpg["reports"][0]
        self.assertIn("title", first_rep)
        self.assertIn("date", first_rep)
        self.assertIn("source", first_rep)
        self.assertIn("file_url", first_rep)
        self.assertTrue(first_rep["file_url"].endswith(".pdf") or "pdf" in first_rep["file_url"].lower())
        self.assertIn("page_count", first_rep)

        # 2. Test với SSI (Ngành Chứng khoán)
        resp_ssi = self.client.get("/api/industry-reports?ticker=SSI")
        self.assertEqual(resp_ssi.status_code, 200)
        data_ssi = resp_ssi.json()
        self.assertIn("Chứng khoán", data_ssi["sector_name"])

        # 3. Test lọc từ khóa
        resp_filter = self.client.get("/api/industry-reports?ticker=HPG&keyword=thép")
        self.assertEqual(resp_filter.status_code, 200)
        data_filter = resp_filter.json()
        self.assertGreater(len(data_filter["reports"]), 0)

        # 4. Test với DBC (Nông nghiệp & Chăn nuôi)
        resp_dbc = self.client.get("/api/industry-reports?ticker=DBC")
        self.assertEqual(resp_dbc.status_code, 200)
        data_dbc = resp_dbc.json()
        self.assertEqual(data_dbc["ticker"], "DBC")
        self.assertIn("Chăn nuôi", data_dbc["sector_name"])
        self.assertEqual(data_dbc["primary_keyword"], "chăn nuôi")
        self.assertGreater(len(data_dbc["reports"]), 0)

        # 5. Test khi người dùng xóa từ khóa và bấm Tìm (all_industries=true)
        resp_all = self.client.get("/api/industry-reports?ticker=MWG&all_industries=true")
        self.assertEqual(resp_all.status_code, 200)
        data_all = resp_all.json()
        self.assertTrue(data_all["all_industries"])
        self.assertEqual(data_all["sector_name"], "Tất cả các ngành")
        self.assertGreaterEqual(len(data_all["reports"]), 10)


if __name__ == "__main__":
    unittest.main()


