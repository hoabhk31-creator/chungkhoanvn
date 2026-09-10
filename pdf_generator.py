# -*- coding: utf-8 -*-
"""
pdf_generator.py - Bộ tạo Báo cáo Phân tích Định giá Doanh nghiệp chuẩn PDF
Chuyên nghiệp dành cho các Công ty Chứng khoán (SSI, HSC, Vietcap, VNDirect, VCBS...)
Hỗ trợ đầy đủ tiếng Việt Unicode, bố cục chuẩn báo cáo CTCK chuyên sâu.
"""

import os
import base64
import tempfile
from datetime import datetime
from typing import Optional
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace
from engine import is_report_expired


class InstitutionalReportPDF(FPDF):
    def __init__(self, institution_name: str, ticker: str, company_name: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=18)
        self.institution_name = institution_name
        self.ticker = ticker.upper()
        self.company_name = company_name

        # Cấu hình font Tiếng Việt từ Windows Fonts
        font_dir = os.environ.get("WINDIR", r"C:\Windows") + r"\Fonts"
        arial_reg = os.path.join(font_dir, "arial.ttf")
        arial_bold = os.path.join(font_dir, "arialbd.ttf")
        arial_italic = os.path.join(font_dir, "ariali.ttf")

        if os.path.exists(arial_reg):
            self.add_font("ArialVN", "", arial_reg)
            self.font_family_regular = "ArialVN"
        else:
            self.font_family_regular = "helvetica"

        if os.path.exists(arial_bold):
            self.add_font("ArialVN", "B", arial_bold)
            self.font_family_bold = "ArialVN"
        else:
            self.font_family_bold = "helvetica"

        if os.path.exists(arial_italic):
            self.add_font("ArialVN", "I", arial_italic)
            self.font_family_italic = "ArialVN"
        else:
            self.font_family_italic = "helvetica"

    def header(self):
        # Header ở đầu trang
        self.set_fill_color(15, 23, 42)  # #0F172A Slate 900
        self.rect(0, 0, 210, 22, "F")

        # Tên CTCK & Loại báo cáo
        self.set_xy(14, 4)
        self.set_text_color(255, 255, 255)
        self.set_font(self.font_family_bold, "B", 13)
        self.cell(100, 7, f"{self.institution_name.upper()} RESEARCH", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")

        self.set_font(self.font_family_bold, "B", 10)
        self.set_text_color(56, 189, 248)  # Sky 400
        self.cell(82, 7, "BÁO CÁO PHÂN TÍCH & ĐỊNH GIÁ", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

        self.set_xy(14, 11)
        self.set_font(self.font_family_regular, "", 8)
        self.set_text_color(203, 213, 225)  # Slate 300
        self.cell(100, 6, f"Mã CK: {self.ticker} - {self.company_name}", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")

        self.cell(82, 6, f"Ngày phát hành: {datetime.now().strftime('%d/%m/%Y')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

        self.ln(6)

    def footer(self):
        # Footer ở chân trang
        self.set_y(-14)
        self.set_draw_color(226, 232, 240)
        self.line(14, self.get_y(), 196, self.get_y())
        self.set_y(-11)
        self.set_font(self.font_family_regular, "I", 7.5)
        self.set_text_color(148, 163, 184)
        self.cell(120, 6, f"{self.institution_name} © Bản quyền báo cáo phân tích thuộc khối Nghiên cứu & Phân tích", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")
        self.cell(62, 6, f"Trang {self.page_no()}/{{nb}}", new_x=XPos.RIGHT, new_y=YPos.TOP, align="R")


def generate_ctck_report_pdf(
    ticker: str,
    company_name: str,
    sector: str,
    report: dict,
    consensus: dict = None,
) -> bytes:
    """
    Tạo nội dung file PDF báo cáo phân tích của công ty chứng khoán
    trả về dưới dạng raw bytes (để gửi trực tiếp về client qua FastAPI).
    """
    institution = report.get("institution", "CTCK")
    target_price = report.get("target_price", 0)
    current_price = report.get("current_price", 0)
    upside_pct = report.get("upside_pct", 0.0)
    recommendation = report.get("recommendation", "MUA")
    report_date = report.get("date", datetime.now().strftime("%d/%m/%Y"))
    catalysts = report.get("catalysts", "Triển vọng kinh doanh khả quan nhờ mở rộng công suất và nhu cầu thị trường hồi phục mạnh mẽ.")
    risks = report.get("risks", "Biến động chi phí nguyên vật liệu đầu vào và rủi ro tỷ giá.")
    
    pdf = InstitutionalReportPDF(institution, ticker, company_name)
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- KHỐI TIÊU ĐỀ CHÍNH & KHUYẾN NGHỊ ---
    pdf.set_xy(14, 26)
    
    # Tiêu đề báo cáo
    pdf.set_font(pdf.font_family_bold, "B", 15)
    pdf.set_text_color(30, 41, 59)  # Slate 800
    pdf.cell(182, 8, f"{ticker}: Triển vọng tăng trưởng & Khuyến nghị {recommendation}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")

    # Phân ngành & Ngày báo cáo
    pdf.set_font(pdf.font_family_regular, "", 9)
    pdf.set_text_color(100, 116, 139)  # Slate 500
    pdf.cell(182, 5, f"Ngành: {sector or 'Công nghiệp'} | Cập nhật định giá: {report_date}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    pdf.ln(3)

    # Khung tóm tắt Khuyến nghị & Định giá (Hero Metrics Box)
    box_y = pdf.get_y()
    pdf.set_fill_color(248, 250, 252)  # Slate 50
    pdf.set_draw_color(203, 213, 225)  # Slate 300
    pdf.rect(14, box_y, 182, 26, "DF")

    # 1. Khuyến nghị
    pdf.set_xy(18, box_y + 3)
    pdf.set_font(pdf.font_family_bold, "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(42, 5, "KHUYẾN NGHỊ", new_x=XPos.LEFT, new_y=YPos.NEXT, align="L")
    
    if "MUA" in recommendation.upper() or "KHA QUAN" in recommendation.upper() or "TÍCH CỰC" in recommendation.upper():
        pdf.set_text_color(16, 185, 129)  # Green
    elif "BAN" in recommendation.upper() or "GIAM" in recommendation.upper() or "TIEU CUC" in recommendation.upper():
        pdf.set_text_color(239, 68, 68)  # Red
    else:
        pdf.set_text_color(245, 158, 11)  # Amber
    
    pdf.set_font(pdf.font_family_bold, "B", 13)
    pdf.cell(42, 7, recommendation.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")

    # 2. Giá mục tiêu (Target Price)
    pdf.set_xy(62, box_y + 3)
    pdf.set_font(pdf.font_family_bold, "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(42, 5, "GIÁ MỤC TIÊU (VND)", new_x=XPos.LEFT, new_y=YPos.NEXT, align="L")
    pdf.set_font(pdf.font_family_bold, "B", 13)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(42, 7, f"{target_price:,.0f}" if target_price else "N/A", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")

    # 3. Thị giá hiện tại (Current Price)
    pdf.set_xy(106, box_y + 3)
    pdf.set_font(pdf.font_family_bold, "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(42, 5, "THỊ GIÁ HIỆN TẠI (VND)", new_x=XPos.LEFT, new_y=YPos.NEXT, align="L")
    pdf.set_font(pdf.font_family_bold, "B", 13)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(42, 7, f"{current_price:,.0f}" if current_price else "N/A", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")

    # 4. Biên tăng giá kỳ vọng (% Upside)
    pdf.set_xy(150, box_y + 3)
    pdf.set_font(pdf.font_family_bold, "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(42, 5, "ĐÃ VƯỢT (%)" if upside_pct < 0 else "BIÊN KỲ VỌNG (%)", new_x=XPos.LEFT, new_y=YPos.NEXT, align="L")
    pdf.set_font(pdf.font_family_bold, "B", 13)
    
    if upside_pct > 0:
        pdf.set_text_color(16, 185, 129)
        pdf.cell(42, 7, f"+{upside_pct:.1f}%", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    elif upside_pct < 0:
        pdf.set_text_color(239, 68, 68)
        pdf.cell(42, 7, f"Vượt +{abs(upside_pct):.1f}%", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    else:
        pdf.set_text_color(100, 116, 139)
        pdf.cell(42, 7, "0.0%", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")

    pdf.set_y(box_y + 30)

    # --- PHẦN 1: TỔNG QUAN LUẬN ĐIỂM ĐẦU TƯ (INVESTMENT THESIS) ---
    pdf.set_font(pdf.font_family_bold, "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 7, "1. TÓM TẮT LUẬN ĐIỂM ĐẦU TƯ & ĐỊNH GIÁ", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    pdf.set_draw_color(37, 99, 235)  # Blue underline
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(2)

    if upside_pct < 0:
        up_thesis = f"thị giá hiện tại ({current_price:,.0f} VND) đã vượt mức giá mục tiêu này (+{abs(upside_pct):.1f}%)"
    else:
        up_thesis = f"tương ứng với biên tăng giá kỳ vọng là +{upside_pct:.1f}% so với thị giá hiện tại {current_price:,.0f} VND"

    thesis_text = (
        f"{institution} công bố báo cáo phân tích đối với {company_name} ({ticker}) "
        f"với khuyến nghị {recommendation} và mức giá mục tiêu {target_price:,.0f} VND/cổ phiếu, "
        f"{up_thesis}.\n"
        f"Doanh nghiệp duy trì vị thế dẫn đầu trong ngành với năng lực cạnh tranh vượt trội, cơ cấu tài chính lành mạnh "
        f"và tiềm năng gia tăng thị phần rõ rệt trong chu kỳ hồi phục kinh tế 2025 - 2026."
    )
    pdf.set_font(pdf.font_family_regular, "", 9.5)
    pdf.set_text_color(51, 65, 85)
    pdf.multi_cell(182, 5.5, thesis_text)
    pdf.ln(3)

    # --- PHẦN 2: BẢNG CHỈ TIÊU DỰ BÁO VÀ ĐỊNH GIÁ MULTIPLES ---
    pdf.set_font(pdf.font_family_bold, "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 7, "2. DỰ BÁO KẾT QUẢ KINH DOANH & ĐỊNH GIÁ", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    pdf.set_draw_color(37, 99, 235)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(2)

    # Table Header
    col_w = [46, 34, 34, 34, 34]
    headers = ["Chỉ tiêu tài chính", "Năm 2023", "Năm 2024", "Dự phóng 2025F", "Dự phóng 2026F"]
    
    pdf.set_fill_color(241, 245, 249)  # Slate 100
    pdf.set_text_color(30, 41, 59)
    pdf.set_font(pdf.font_family_bold, "B", 8.5)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 6.5, h, border=1, fill=True, align="C" if i > 0 else "L")
    pdf.ln()

    # Table Rows
    pdf.set_font(pdf.font_family_regular, "", 8.5)
    data_rows = [
        ("Doanh thu thuần (Tỷ VND)", "Tăng trưởng ổn định", "+18.5% YoY", "+22.4% YoY", "+16.8% YoY"),
        ("LNST công ty mẹ (Tỷ VND)", "Đạt đáy chu kỳ", "Hồi phục mạnh", "+35.2% YoY", "+19.5% YoY"),
        ("Tỷ suất EPS (VND/cp)", "1,850", "2,480", "3,350", "4,010"),
        ("Tỷ suất ROE (%)", "12.4%", "15.8%", "19.2%", "20.5%"),
        ("Hệ số P/E dự phóng (x)", "15.2x", "12.6x", "9.8x", "8.2x"),
        ("Hệ số P/B dự phóng (x)", "1.7x", "1.5x", "1.3x", "1.1x"),
    ]

    for row_idx, row in enumerate(data_rows):
        fill = (row_idx % 2 == 1)
        pdf.set_fill_color(248, 250, 252) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.cell(col_w[0], 6, row[0], border=1, fill=fill, align="L")
        for i in range(1, 5):
            pdf.cell(col_w[i], 6, row[i], border=1, fill=fill, align="C")
        pdf.ln()

    pdf.ln(3)

    # --- PHẦN 3: CÁC ĐỘNG LỰC TĂNG TRƯỞNG & YẾU TỐ KỲ VỌNG ---
    pdf.set_font(pdf.font_family_bold, "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 7, "3. ĐỘNG LỰC TĂNG TRƯỞNG & YẾU TỐ KỲ VỌNG CHÍNH (CATALYSTS)", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    pdf.set_draw_color(37, 99, 235)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(2)

    cat_box_y = pdf.get_y()
    pdf.set_fill_color(240, 253, 244)  # Green 50
    pdf.set_draw_color(187, 247, 208)  # Green 200
    pdf.rect(14, cat_box_y, 182, 22, "DF")

    pdf.set_xy(17, cat_box_y + 2)
    pdf.set_font(pdf.font_family_bold, "B", 8.5)
    pdf.set_text_color(22, 101, 52)  # Green 800
    pdf.cell(176, 4.5, f"Luận cứ kỳ vọng cốt lõi từ {institution}:", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_xy(17, cat_box_y + 7)
    pdf.set_font(pdf.font_family_regular, "", 8.5)
    pdf.set_text_color(21, 128, 61)  # Green 700
    pdf.multi_cell(176, 4.5, catalysts)

    pdf.set_y(cat_box_y + 25)

    # --- PHẦN 4: RỦI RO ĐẦU TƯ TRỌNG YẾU (KEY INVESTMENT RISKS) ---
    pdf.set_font(pdf.font_family_bold, "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 7, "4. RỦI RO TRỌNG YẾU CẦN THEO DÕI (KEY RISKS)", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    pdf.set_draw_color(239, 68, 68)  # Red underline
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(2)

    risk_box_y = pdf.get_y()
    pdf.set_fill_color(254, 242, 242)  # Red 50
    pdf.set_draw_color(254, 202, 202)  # Red 200
    pdf.rect(14, risk_box_y, 182, 20, "DF")

    pdf.set_xy(17, risk_box_y + 2)
    pdf.set_font(pdf.font_family_bold, "B", 8.5)
    pdf.set_text_color(153, 27, 27)  # Red 800
    pdf.cell(176, 4.5, "Các nguy cơ & thách thức đối với định giá:", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_xy(17, risk_box_y + 7)
    pdf.set_font(pdf.font_family_regular, "", 8.5)
    pdf.set_text_color(185, 28, 28)  # Red 700
    pdf.multi_cell(176, 4.5, risks)

    pdf.set_y(risk_box_y + 23)

    # --- PHẦN 5: BẢNG TỔNG HỢP SO SÁNH CONSENSUS THỊ TRƯỜNG (NẾU CÓ) ---
    if consensus:
        avg_target = consensus.get("avg_target", 0)
        avg_upside = consensus.get("avg_upside_pct", 0.0)
        highest = consensus.get("highest_target", 0)
        lowest = consensus.get("lowest_target", 0)
        total_reports = consensus.get("total_reports", 0)

        pdf.set_font(pdf.font_family_bold, "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(182, 6, f"5. SO SÁNH VỚI ĐỊNH GIÁ TRUNG BÌNH THỊ TRƯỜNG (CONSENSUS: {total_reports} CTCK)", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
        pdf.set_draw_color(203, 213, 225)
        pdf.line(14, pdf.get_y(), 196, pdf.get_y())
        pdf.ln(2)

        pdf.set_font(pdf.font_family_regular, "", 8.5)
        pdf.set_text_color(71, 85, 105)
        up_cons_str = f"thị giá đã vượt kỳ vọng định giá TB (+{abs(avg_upside):.1f}%)" if avg_upside < 0 else f"Biên tăng kỳ vọng trung bình: +{avg_upside:.1f}%"
        cons_text = (
            f"Thị trường hiện có {total_reports} CTCK theo dõi định giá {ticker}. "
            f"Mức định giá trung bình đạt {avg_target:,.0f} VND ({up_cons_str}). "
            f"Định giá cao nhất: {highest:,.0f} VND | Thấp nhất: {lowest:,.0f} VND. "
            f"Định giá của {institution} ({target_price:,.0f} VND) nằm ở vị trí "
            f"{'cao hơn' if target_price >= avg_target else 'thận trọng hơn'} mức trung bình ngành."
        )
        pdf.multi_cell(182, 4.5, cons_text)
        pdf.ln(2)

    # --- KHUYẾN CÁO MIỄN TRỪ TRÁCH NHIỆM (DISCLAIMER) ---
    pdf.set_y(260)
    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(14, 260, 182, 22, "DF")

    pdf.set_xy(16, 261)
    pdf.set_font(pdf.font_family_bold, "B", 7.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(178, 4, "KHUYẾN CÁO MIỄN TRỪ TRÁCH NHIỆM (DISCLAIMER)", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_xy(16, 265)
    pdf.set_font(pdf.font_family_regular, "I", 6.8)
    pdf.set_text_color(148, 163, 184)
    disclaimer_text = (
        f"Báo cáo phân tích này được biên soạn bởi Bộ phận Nghiên cứu & Phân tích của {institution}. "
        "Mọi thông tin, nhận định và dự báo trong báo cáo dựa trên nguồn dữ liệu đáng tin cậy tại thời điểm công bố. "
        "Báo cáo chỉ nhằm mục đích cung cấp thông tin tham khảo cho nhà đầu tư, không cấu thành bất kỳ lời mời chào mua "
        "hay bán chứng khoán nào. Nhà đầu tư chịu hoàn toàn trách nhiệm đối với quyết định đầu tư của mình."
    )
    pdf.multi_cell(178, 3.2, disclaimer_text)

    # Xuất ra bytes
    return bytes(pdf.output())


class MatrixTableLandscapePDF(FPDF):
    def __init__(self, ticker: str, company_name: str, sector: str):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=15)
        self.ticker = ticker.upper()
        self.company_name = company_name
        self.sector = sector

        # Cấu hình font Tiếng Việt từ Windows Fonts
        font_dir = os.environ.get("WINDIR", r"C:\Windows") + r"\Fonts"
        arial_reg = os.path.join(font_dir, "arial.ttf")
        arial_bold = os.path.join(font_dir, "arialbd.ttf")
        arial_italic = os.path.join(font_dir, "ariali.ttf")

        if os.path.exists(arial_reg):
            self.add_font("ArialVN", "", arial_reg)
            self.font_family_regular = "ArialVN"
        else:
            self.font_family_regular = "helvetica"

        if os.path.exists(arial_bold):
            self.add_font("ArialVN", "B", arial_bold)
            self.font_family_bold = "ArialVN"
        else:
            self.font_family_bold = "helvetica"

        if os.path.exists(arial_italic):
            self.add_font("ArialVN", "I", arial_italic)
            self.font_family_italic = "ArialVN"
        else:
            self.font_family_italic = "helvetica"

    def header(self):
        self.set_fill_color(15, 23, 42)  # #0F172A Slate 900
        self.rect(0, 0, 297, 20, "F")

        # Mục 1: IERM TERMINAL // BẢNG ĐỐI CHIẾU TRỰC DIỆN ĐA TỔ CHỨC -> Cho nhỏ lại (font 8pt, màu xám xanh Slate 400)
        self.set_xy(12, 2.5)
        self.set_text_color(148, 163, 184)  # Slate 400
        self.set_font(self.font_family_regular, "", 8)
        self.cell(160, 4.5, "IERM TERMINAL // BẢNG ĐỐI CHIẾU TRỰC DIỆN ĐA TỔ CHỨC", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")

        self.set_font(self.font_family_regular, "", 7.5)
        self.set_text_color(100, 116, 139)  # Slate 500
        self.cell(113, 4.5, "HORIZONTAL RECONCILIATION MATRIX", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

        # Mục 2: Mã CK, Tên công ty, Ngành -> Phóng to ra (font 11.5pt đậm), màu nổi bật (Vàng sáng / Cyan nổi bật)
        self.set_xy(12, 8)
        self.set_font(self.font_family_bold, "B", 11.5)
        self.set_text_color(254, 240, 138)  # Yellow 200 / Gold highlight
        self.cell(185, 7, f"Mã CK: {self.ticker} - {self.company_name} | Ngành: {self.sector}", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")

        self.set_font(self.font_family_regular, "", 8)
        self.set_text_color(203, 213, 225)
        self.cell(88, 7, f"Thời điểm xuất: {datetime.now().strftime('%d/%m/%Y %H:%M')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

        self.ln(6)

    def footer(self):
        self.set_y(-12)
        self.set_draw_color(226, 232, 240)
        self.line(12, self.get_y(), 285, self.get_y())
        self.set_y(-10)
        self.set_font(self.font_family_regular, "I", 7.5)
        self.set_text_color(148, 163, 184)
        self.cell(180, 5, "IERM Financial Intelligence Engine © Chuẩn hóa dữ liệu theo nguyên tắc Fact & Data First", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")
        self.cell(93, 5, f"Trang {self.page_no()}/{{nb}}", new_x=XPos.RIGHT, new_y=YPos.TOP, align="R")


def generate_matrix_table_pdf(report_data: dict) -> bytes:
    """
    Tạo file PDF A4 Landscape chuẩn mực, linh động, không bị đè chữ, không bị cắt dòng.
    Bao gồm:
    - Trang 1: Bảng Ma Trận Đối Chiếu Định Lượng Đa Tổ Chức & Dải Chiến Lược Đầu Tư.
    - Trang 2+: Bảng So Sánh Chi Tiết Toàn Văn Luận Điểm Tăng Trưởng (Catalysts) & Rủi Ro (Key Risks) Đa Tổ Chức.
    """
    ticker = report_data.get("ticker", "CP")
    company_name = report_data.get("company_name", f"Công ty Cổ phần {ticker}")
    sector = report_data.get("sector", "Doanh nghiệp niêm yết")
    reports = report_data.get("matrix_table", [])
    cs = report_data.get("consensus_summary", {})

    pdf = MatrixTableLandscapePDF(ticker=ticker, company_name=company_name, sector=sector)
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- TRANG 1: MA TRẬN ĐỊNH LƯỢNG (QUANTITATIVE RECONCILIATION) ---
    market_p = cs.get("current_market_price", 0)
    mean_target = cs.get("mean_target_price", 0)
    avg_upside = cs.get("average_upside", 0.0)
    rating = cs.get("consensus_rating", "MUA")

    # Executive Summary Strip
    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(12, 22, 273, 12, "DF")

    pdf.set_xy(15, 23)
    pdf.set_font(pdf.font_family_bold, "B", 7.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(50, 3.5, "THỊ GIÁ THAM CHIẾU", align="L")
    pdf.cell(55, 3.5, "ĐỊNH GIÁ TRUNG BÌNH (MEAN)", align="L")
    pdf.cell(50, 3.5, "KỲ VỌNG THỊ GIÁ VS ĐỊNH GIÁ" if avg_upside < 0 else "TIỀM NĂNG TĂNG GIÁ (UPSIDE)", align="L")
    pdf.cell(60, 3.5, "ĐỒNG THUẬN KHUYẾN NGHỊ", align="L")
    pdf.cell(50, 3.5, "MẪU BÁO CÁO CTCK", align="L")
    pdf.ln()

    pdf.set_x(15)
    pdf.set_font(pdf.font_family_bold, "B", 9.5)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(50, 5.5, f"{market_p:,.0f} VND", align="L")
    pdf.set_text_color(2, 132, 199)
    if mean_target > 0:
        pdf.cell(55, 5.5, f"{mean_target:,.0f} VND", align="L")
        if avg_upside >= 0:
            pdf.set_text_color(16, 185, 129)
            pdf.cell(50, 5.5, f"+{avg_upside:.1f}%", align="L")
        else:
            pdf.set_text_color(239, 68, 68)
            pdf.cell(50, 5.5, f"Vượt +{abs(avg_upside):.1f}%", align="L")
    else:
        pdf.cell(55, 5.5, "—", align="L")
        pdf.set_text_color(245, 158, 11)
        pdf.cell(50, 5.5, "Cần theo dõi thêm", align="L")

    pdf.set_text_color(15, 23, 42)
    pdf.cell(60, 5.5, str(rating), align="L")
    pdf.cell(50, 5.5, f"{len(reports)} Báo cáo Tổ chức", align="L")
    pdf.ln(7)

    # Tiêu đề Phần 1
    pdf.set_font(pdf.font_family_bold, "B", 9.5)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(273, 5, "PHẦN 1: BẢNG ĐỐI CHIẾU TRỰC DIỆN ĐỊNH LƯỢNG (QUANTITATIVE RECONCILIATION MATRIX)", align="L")
    pdf.ln(5)

    # Tính độ rộng cột Trang 1
    num_reports = max(1, len(reports))
    col_crit_w = 48
    col_cons_w = 45
    rem_w = 273 - col_crit_w - col_cons_w
    col_r_w = rem_w / num_reports
    col_widths_p1 = [col_crit_w] + [col_r_w] * num_reports + [col_cons_w]

    headings_style = FontFace(family="ArialVN", emphasis="B", size_pt=7.5, color=(255, 255, 255), fill_color=(15, 23, 42))

    with pdf.table(col_widths=col_widths_p1, headings_style=headings_style, line_height=4.6, padding=1.2, text_align="CENTER") as table:
        # Header
        h_row = table.row()
        h_row.cell("TIÊU CHÍ ĐỐI CHIẾU", align="L")
        for r in reports:
            inst = r.get("institution", "CTCK")
            date_str = r.get("report_date", "")
            is_exp = r.get("is_expired", False) or is_report_expired(date_str)
            exp_sub = "\n(Quá 1 năm)" if is_exp else ""
            h_row.cell(f"{inst}\n({date_str}){exp_sub}", align="C")
        h_row.cell("CONSENSUS\n& ĐỘ LỆCH", align="C")

        # Row 1: Khuyến nghị
        r1 = table.row()
        r1.cell("1. Khuyến nghị đầu tư", align="L")
        for r in reports:
            is_exp = r.get("is_expired", False) or is_report_expired(r.get("report_date", ""))
            raw_rec = r.get("recommendation", "N/A")
            if is_exp:
                r1.cell(f"{raw_rec}\n(Hết hiệu lực)", align="C")
            else:
                r1.cell(raw_rec, align="C")
        r1.cell(cs.get("consensus_rating", "MUA"), align="C")

        # Row 2: Giá mục tiêu
        r2 = table.row()
        r2.cell("2. Giá mục tiêu (VND)", align="L")
        for r in reports:
            is_exp = r.get("is_expired", False) or is_report_expired(r.get("report_date", ""))
            is_tech = r.get("is_technical", False) or "PTKT" in r.get("recommendation", "").upper()
            tp = r.get("target_price", 0)
            if is_exp:
                r2.cell(f"{tp:,.0f} đ\n(Quá 1 năm)" if tp > 0 else "— (Quá 1 năm)", align="C")
            elif is_tech:
                r2.cell("— (PTKT)", align="C")
            elif not tp or tp <= 0 or r.get("is_estimated_price", False):
                r2.cell("— (KQKD)", align="C")
            else:
                r2.cell(f"{tp:,.0f} đ", align="C")
        r2.cell(f"Mean: {mean_target:,.0f} đ" if mean_target > 0 else "— (Theo dõi thêm)", align="C")

        # Row 3: Upside %
        r3 = table.row()
        r3.cell("3. Tiềm năng tăng giá (Upside)", align="L")
        for r in reports:
            is_exp = r.get("is_expired", False) or is_report_expired(r.get("report_date", ""))
            is_tech = r.get("is_technical", False) or "PTKT" in r.get("recommendation", "").upper()
            tp = r.get("target_price", 0)
            up = r.get("upside_percent")
            if is_exp or is_tech or not tp or tp <= 0 or r.get("is_estimated_price", False) or up is None:
                r3.cell("—", align="C")
            else:
                if up < 0:
                    r3.cell(f"Vượt +{abs(up):.1f}%", align="C")
                else:
                    r3.cell(f"+{up:.1f}%", align="C")
        if mean_target > 0 and avg_upside is not None and avg_upside != 0:
            if avg_upside < 0:
                r3.cell(f"Vượt +{abs(avg_upside):.1f}%", align="C")
            else:
                r3.cell(f"+{avg_upside:.1f}%", align="C")
        else:
            r3.cell("—", align="C")

        # Row 4: P/E forward
        r4 = table.row()
        r4.cell("4. Định giá P/E Forward", align="L")
        for r in reports:
            pe = r.get("pe_forward")
            r4.cell(f"{pe:.1f}x" if pe else "—", align="C")
        valid_pes = [r.get("pe_forward") for r in reports if r.get("pe_forward") and r.get("pe_forward") > 0]
        avg_pe = sum(valid_pes) / len(valid_pes) if valid_pes else 0
        r4.cell(f"TB: {avg_pe:.1f}x" if avg_pe > 0 else "—", align="C")

        # Row 5: P/B forward
        r5 = table.row()
        r5.cell("5. Định giá P/B Forward", align="L")
        for r in reports:
            pb = r.get("pb_forward")
            r5.cell(f"{pb:.2f}x" if pb else "—", align="C")
        valid_pbs = [r.get("pb_forward") for r in reports if r.get("pb_forward") and r.get("pb_forward") > 0]
        avg_pb = sum(valid_pbs) / len(valid_pbs) if valid_pbs else 0
        r5.cell(f"TB: {avg_pb:.2f}x" if avg_pb > 0 else "—", align="C")

        # Row 6: Dự phóng Doanh thu
        r6 = table.row()
        r6.cell("6. Dự phóng Doanh thu thuần", align="L")
        for r in reports:
            r6.cell(r.get("revenue_forecast", "N/A"), align="C")
        r6.cell("Đồng thuận tích cực", align="C")

        # Row 7: Dự phóng LNST
        r7 = table.row()
        r7.cell("7. Dự phóng LNST công ty mẹ", align="L")
        for r in reports:
            r7.cell(r.get("npat_forecast", "N/A"), align="C")
        r7.cell(f"Độ lệch: {cs.get('target_price_spread_percent', 0):.1f}%", align="C")

        # Row 8: Phương pháp định giá
        r8 = table.row()
        r8.cell("8. Phương pháp định giá chính", align="L")
        for r in reports:
            r8.cell(r.get("valuation_method", "DCF & P/E") or "DCF / P/E", align="C")
        r8.cell("IERM Blended", align="C")

        # Row 9: Dẫn chiếu Luận điểm & Rủi ro
        r9 = table.row()
        r9.cell("9. Luận điểm & Rủi ro chi tiết", align="L")
        for r in reports:
            cats = r.get("key_catalysts", [])
            txt_short = cats[0][:26] + "..." if cats else "Xem Trang 2"
            r9.cell(txt_short, align="C")
        r9.cell("→ Xem chi tiết tại Trang 2", align="C")

    pdf.ln(3)

    # Khung Chiến lược giải ngân & Quản trị rủi ro ở chân Trang 1
    pdf.set_fill_color(240, 253, 244)
    pdf.set_draw_color(187, 247, 208)
    pdf.rect(12, pdf.get_y(), 273, 9, "DF")
    pdf.set_xy(15, pdf.get_y() + 1.5)
    pdf.set_font(pdf.font_family_bold, "B", 7.8)
    pdf.set_text_color(21, 128, 61)
    buy_zone = cs.get("recommended_buy_zone", "20,500 - 22,000 VND")
    stop_loss = cs.get("stop_loss_threshold", "< 19,500 VND")
    pdf.cell(135, 5, f"CHIẾN LƯỢC: Vùng giải ngân tích lũy khuyến nghị: {buy_zone}", align="L")
    pdf.set_text_color(185, 28, 28)
    pdf.cell(135, 5, f"QUẢN TRỊ RỦI RO: Ngưỡng dừng lỗ: {stop_loss}", align="R")

    # --- TRANG 2+: BẢNG CHI TIẾT TOÀN VĂN LUẬN ĐIỂM TĂNG TRƯỞNG & RỦI RO (QUALITATIVE DEEP-DIVE) ---
    pdf.add_page()

    pdf.set_xy(12, 22)
    pdf.set_font(pdf.font_family_bold, "B", 9.5)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(273, 5, "PHẦN 2: BÓC TÁCH CHI TIẾT LUẬN ĐIỂM TĂNG TRƯỞNG (CATALYSTS) & RỦI RO TRỌNG YẾU (KEY RISKS)", align="L")
    pdf.ln(4.5)
    pdf.set_x(12)
    pdf.set_font(pdf.font_family_regular, "", 7.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(273, 4, f"Đối chiếu toàn văn luận cứ phân tích của {len(reports)} tổ chức nghiên cứu chứng khoán - Tự động co giãn theo nội dung, không cắt chữ", align="L")
    pdf.ln(5)

    headings_style_p2 = FontFace(family="ArialVN", emphasis="B", size_pt=8, color=(255, 255, 255), fill_color=(15, 23, 42))

    with pdf.table(col_widths=(50, 112, 111), headings_style=headings_style_p2, line_height=4.5, padding=2.0, repeat_headings=1) as table_p2:
        h_row2 = table_p2.row()
        h_row2.cell("TỔ CHỨC & KHUYẾN NGHỊ", align="L")
        h_row2.cell("LUẬN ĐIỂM TĂNG TRƯỞNG THEN CHỐT (KEY CATALYSTS)", align="L")
        h_row2.cell("RỦI RO TRỌNG YẾU CẦN THEO DÕI (KEY RISKS)", align="L")

        for r in reports:
            row = table_p2.row()
            inst = r.get("institution", "CTCK")
            date_str = r.get("report_date", "")
            rec = r.get("recommendation", "MUA")
            is_tech = r.get("is_technical", False) or "PTKT" in r.get("recommendation", "").upper()
            is_exp = r.get("is_expired", False) or is_report_expired(date_str)
            tp = r.get("target_price", 0)
            up = r.get("upside_percent")
            if is_exp:
                col1_text = f"{inst}\nNgày: {date_str} (Quá 1 năm)\n{rec} (Quá hạn)\nMục tiêu: {tp:,.0f} đ\nUpside: — (Quá hạn)"
            elif is_tech:
                col1_text = f"{inst}\nNgày: {date_str}\n{rec}\nMục tiêu: — (PTKT)\nUpside: —"
            elif not tp or tp <= 0 or r.get("is_estimated_price", False) or up is None:
                col1_text = f"{inst}\nNgày: {date_str}\n{rec}\nMục tiêu: — (KQKD)\nUpside: —"
            else:
                up_text = f"Vượt +{abs(up):.1f}%" if up < 0 else f"+{up:.1f}%"
                col1_text = f"{inst}\nNgày: {date_str}\n{rec}\nMục tiêu: {tp:,.0f} đ\nUpside: {up_text}"
            row.cell(col1_text, align="L")

            cats = r.get("key_catalysts", [])
            cats_text = "\n".join([f"• {c}" for c in cats]) if cats else "• Triển vọng duy trì tăng trưởng theo chu kỳ hồi phục của ngành."
            row.cell(cats_text, align="L")

            risks = r.get("key_risks", [])
            risks_text = "\n".join([f"• {k}" for k in risks]) if risks else "• Rủi ro biến động nguyên vật liệu đầu vào và lãi suất."
            row.cell(risks_text, align="L")

    return bytes(pdf.output())


class PeerComparisonLandscapePDF(FPDF):
    def __init__(self, ticker: str, sector: str, peer_count: int):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=15)
        self.ticker = ticker.upper()
        self.sector = sector
        self.peer_count = peer_count

        font_dir = os.environ.get("WINDIR", r"C:\Windows") + r"\Fonts"
        arial_reg = os.path.join(font_dir, "arial.ttf")
        arial_bold = os.path.join(font_dir, "arialbd.ttf")
        arial_italic = os.path.join(font_dir, "ariali.ttf")

        if os.path.exists(arial_reg):
            self.add_font("ArialVN", "", arial_reg)
            self.font_family_regular = "ArialVN"
        else:
            self.font_family_regular = "helvetica"

        if os.path.exists(arial_bold):
            self.add_font("ArialVN", "B", arial_bold)
            self.font_family_bold = "ArialVN"
        else:
            self.font_family_bold = "helvetica"

        if os.path.exists(arial_italic):
            self.add_font("ArialVN", "I", arial_italic)
            self.font_family_italic = "ArialVN"
        else:
            self.font_family_italic = "helvetica"

    def header(self):
        self.set_fill_color(15, 23, 42)  # Slate 900
        self.rect(0, 0, 297, 20, "F")

        self.set_xy(12, 2.5)
        self.set_text_color(148, 163, 184)
        self.set_font(self.font_family_regular, "", 8)
        self.cell(160, 4.5, "IERM TERMINAL // BÁO CÁO PHÂN TÍCH ĐỐI THỦ CÙNG NGÀNH", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")

        self.set_font(self.font_family_regular, "", 7.5)
        self.set_text_color(100, 116, 139)
        self.cell(113, 4.5, "PEER BENCHMARKING & INDUSTRY RADAR", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

        self.set_xy(12, 8)
        self.set_font(self.font_family_bold, "B", 11.5)
        self.set_text_color(254, 240, 138)  # Gold highlight
        self.cell(185, 7, f"Mã CK: {self.ticker} | Ngành: {self.sector} | Quy mô: {self.peer_count} Doanh nghiệp", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")

        self.set_font(self.font_family_regular, "", 8)
        self.set_text_color(203, 213, 225)
        self.cell(88, 7, f"Thời điểm xuất: {datetime.now().strftime('%d/%m/%Y %H:%M')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

        self.ln(6)

    def footer(self):
        self.set_y(-12)
        self.set_draw_color(226, 232, 240)
        self.line(12, self.get_y(), 285, self.get_y())
        self.set_y(-10)
        self.set_font(self.font_family_regular, "I", 7.5)
        self.set_text_color(148, 163, 184)
        self.cell(180, 5, "IERM Financial Intelligence Engine © Ưu tiên API SSI #1 (Bổ sung Vietstock & CafeF)", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")
        self.cell(93, 5, f"Trang {self.page_no()}/{{nb}}", new_x=XPos.RIGHT, new_y=YPos.TOP, align="R")


def generate_peer_comparison_pdf(peers_data: dict, radar_img_base64: Optional[str] = None) -> bytes:
    """
    Tạo file PDF A4 Landscape báo cáo so sánh đối thủ cùng ngành và Radar sức mạnh tài chính.
    Bao gồm:
    - Trang 1: Tóm lược chỉ số ngành & Bảng số liệu chi tiết toàn bộ doanh nghiệp cùng ngành.
    - Trang 2: Radar sức mạnh tài chính (ảnh + bảng) & Mô hình 5 lực lượng cạnh tranh Porter + Catalysts.
    """
    target_ticker = (peers_data.get("target_ticker") or "CP").upper()
    sector_name = peers_data.get("sector_name") or "Doanh nghiệp niêm yết"
    peers = peers_data.get("peers", [])
    avg = peers_data.get("industry_average", {})
    kpi_cols = peers_data.get("sector_kpi_columns", [])
    radar = peers_data.get("radar_metrics", {})
    forces = peers_data.get("porter_five_forces", {})
    cycle = peers_data.get("industry_cycle", "Tăng trưởng")
    catalysts = peers_data.get("industry_catalysts", [])

    pdf = PeerComparisonLandscapePDF(ticker=target_ticker, sector=sector_name, peer_count=len(peers))
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- 1. EXECUTIVE SUMMARY STRIP ---
    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(12, 22, 273, 11, "DF")

    pdf.set_xy(15, 23)
    pdf.set_font(pdf.font_family_bold, "B", 7.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(50, 3.5, "MÃ CỔ PHIẾU PHÂN TÍCH", align="L")
    pdf.cell(55, 3.5, "NGÀNH NGHỀ KINH DOANH", align="L")
    pdf.cell(55, 3.5, "P/E DOANH NGHIỆP / TB NGÀNH", align="L")
    pdf.cell(55, 3.5, "ROE DOANH NGHIỆP / TB NGÀNH", align="L")
    pdf.cell(55, 3.5, "BIÊN RÒNG / TB NGÀNH", align="L")
    pdf.ln()

    # Target Peer Stats
    target_peer = next((p for p in peers if p.get("ticker") == target_ticker), (peers[0] if peers else {}))
    t_pe = target_peer.get("pe", "—")
    a_pe = avg.get("pe", "—")
    t_roe = target_peer.get("roe", "—")
    a_roe = avg.get("roe", "—")
    t_nm = target_peer.get("net_margin", "—")
    a_nm = avg.get("net_margin", "—")

    pdf.set_x(15)
    pdf.set_font(pdf.font_family_bold, "B", 8.5)
    pdf.set_text_color(2, 132, 199)  # Sky blue
    pdf.cell(50, 4.5, f"{target_ticker} (Đang xem)", align="L")
    pdf.set_text_color(15, 23, 42)
    pdf.cell(55, 4.5, f"{sector_name[:24]}", align="L")
    pdf.cell(55, 4.5, f"{t_pe}x  vs  {a_pe}x", align="L")
    pdf.set_text_color(16, 185, 129)  # Green
    pdf.cell(55, 4.5, f"{t_roe}%  vs  {a_roe}%", align="L")
    pdf.set_text_color(15, 23, 42)
    pdf.cell(55, 4.5, f"{t_nm}%  vs  {a_nm}%", align="L")

    pdf.ln(7)

    # --- 2. PEER COMPARISON TABLE ---
    pdf.set_xy(12, 35)
    pdf.set_font(pdf.font_family_bold, "B", 9)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(200, 5, "BẢNG CHỈ SỐ TÀI CHÍNH & ĐỊNH GIÁ ĐỐI THỦ CÙNG NGÀNH", align="L")
    pdf.set_font(pdf.font_family_regular, "", 7.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(73, 5, "Đơn vị: Tỷ VNĐ / Lần (x) / Tỷ lệ (%)", align="R")
    pdf.ln(5.5)

    base_cols = [
        ["Mã CP", 18],
        ["Doanh nghiệp", 50],
        ["Vốn hóa", 24],
        ["P/E", 18],
        ["P/B", 18],
        ["ROE", 20],
        ["ROA", 20],
        ["Biên ròng", 22],
        ["Nợ/VCSH", 20],
    ]
    base_total = sum(w for _, w in base_cols)
    remain = 273 - base_total

    kpi_count = len(kpi_cols)
    kpi_widths = []
    if kpi_count > 0:
        kpi_w = max(18, remain / kpi_count)
        if base_total + kpi_count * kpi_w > 273:
            excess = (base_total + kpi_count * kpi_w) - 273
            base_cols[1][1] = max(35, 50 - excess)
            base_total = sum(w for _, w in base_cols)
            kpi_w = (273 - base_total) / kpi_count
        kpi_widths = [kpi_w] * kpi_count

    all_widths = [w for _, w in base_cols] + kpi_widths
    headings_style = FontFace(family="ArialVN", emphasis="B", size_pt=7.5, color=(255, 255, 255), fill_color=(15, 23, 42))

    with pdf.table(col_widths=tuple(all_widths), headings_style=headings_style, line_height=5.0, padding=1.8, repeat_headings=1) as table:
        h = table.row()
        for label, _ in base_cols:
            h.cell(label, align="L" if label in ("Mã CP", "Doanh nghiệp") else "R")
        for col in kpi_cols:
            lbl = col.get("label", "")
            unit = col.get("unit", "")
            h.cell(f"{lbl} ({unit})" if unit else lbl, align="R")

        for p in peers:
            row = table.row()
            is_target = p.get("ticker") == target_ticker
            if is_target:
                row_style = FontFace(family="ArialVN", emphasis="B", size_pt=7.5, color=(2, 132, 199), fill_color=(224, 242, 254))
            else:
                row_style = FontFace(family="ArialVN", size_pt=7.0, color=(30, 41, 59))

            mcap = p.get("market_cap_bil", 0)
            mcap_str = f"{mcap/1000:.1f}k tỷ" if mcap >= 1000 else f"{int(mcap):,} tỷ" if mcap else "—"

            row.cell(p.get("ticker", "") + (" *" if is_target else ""), style=row_style, align="L")
            row.cell(p.get("name", "")[:28], style=row_style, align="L")
            row.cell(mcap_str, style=row_style, align="R")
            row.cell(f"{p.get('pe', '—')}x" if p.get('pe') is not None else "—", style=row_style, align="R")
            row.cell(f"{p.get('pb', '—')}x" if p.get('pb') is not None else "—", style=row_style, align="R")
            row.cell(f"{p.get('roe', '—')}%" if p.get('roe') is not None else "—", style=row_style, align="R")
            row.cell(f"{p.get('roa', '—')}%" if p.get('roa') is not None else "—", style=row_style, align="R")
            row.cell(f"{p.get('net_margin', '—')}%" if p.get('net_margin') is not None else "—", style=row_style, align="R")
            row.cell(f"{p.get('debt_to_equity', '—')}x" if p.get('debt_to_equity') is not None else "—", style=row_style, align="R")

            for col in kpi_cols:
                val = p.get(col.get("field"))
                val_str = f"{val:,.1f}" if isinstance(val, (int, float)) else str(val) if val is not None else "—"
                row.cell(val_str, style=row_style, align="R")

        avg_style = FontFace(family="ArialVN", emphasis="B", size_pt=7.5, color=(15, 23, 42), fill_color=(226, 232, 240))
        avg_row = table.row()
        avg_row.cell(f"TRUNG BÌNH ({len(peers)} DN)", style=avg_style, align="L")
        avg_row.cell("—", style=avg_style, align="L")
        avg_row.cell("—", style=avg_style, align="R")
        avg_row.cell(f"{avg.get('pe', '—')}x" if avg.get('pe') is not None else "—", style=avg_style, align="R")
        avg_row.cell(f"{avg.get('pb', '—')}x" if avg.get('pb') is not None else "—", style=avg_style, align="R")
        avg_row.cell(f"{avg.get('roe', '—')}%" if avg.get('roe') is not None else "—", style=avg_style, align="R")
        avg_row.cell(f"{avg.get('roa', '—')}%" if avg.get('roa') is not None else "—", style=avg_style, align="R")
        avg_row.cell(f"{avg.get('net_margin', '—')}%" if avg.get('net_margin') is not None else "—", style=avg_style, align="R")
        avg_row.cell(f"{avg.get('debt_to_equity', '—')}x" if avg.get('debt_to_equity') is not None else "—", style=avg_style, align="R")
        for col in kpi_cols:
            val = avg.get(col.get("field"))
            val_str = f"{val:,.1f}" if isinstance(val, (int, float)) else str(val) if val is not None else "—"
            avg_row.cell(val_str, style=avg_style, align="R")

    # --- 3. PAGE 2: RADAR CHART & PORTER 5 FORCES ---
    pdf.add_page()

    pdf.set_xy(12, 22)
    pdf.set_font(pdf.font_family_bold, "B", 9.5)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(273, 5, f"PHẦN 2: RADAR SỨC MẠNH TÀI CHÍNH & MÔ HÌNH CẠNH TRANH NGÀNH ({sector_name.upper()})", align="L")
    pdf.ln(5)

    current_y = pdf.get_y()

    # Cột Trái: Radar Metrics & Biểu đồ (Rộng 132mm)
    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(12, current_y, 132, 160, "DF")

    pdf.set_xy(15, current_y + 2)
    pdf.set_font(pdf.font_family_bold, "B", 8.5)
    pdf.set_text_color(2, 132, 199)
    pdf.cell(126, 5, f"1. RADAR SỨC MẠNH TÀI CHÍNH ({target_ticker} VS TB NGÀNH)", align="L")
    pdf.ln(5.5)

    temp_img_path = None
    if radar_img_base64:
        try:
            if "," in radar_img_base64:
                radar_img_base64 = radar_img_base64.split(",", 1)[1]
            img_bytes = base64.b64decode(radar_img_base64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                tmp.write(img_bytes)
                temp_img_path = tmp.name
            pdf.image(temp_img_path, x=20, y=pdf.get_y(), w=116)
            pdf.set_y(pdf.get_y() + 85)
        except Exception as e:
            print("Failed to embed radar img:", e)

    if radar and radar.get("categories"):
        cats = radar.get("categories", [])
        t_scores = radar.get(target_ticker.lower()) or radar.get("target") or []
        i_scores = radar.get("industry") or []

        pdf.set_x(15)
        pdf.set_font(pdf.font_family_bold, "B", 7.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(126, 4, "Chi tiết điểm số sức mạnh tài chính chuẩn hóa (0 - 100):", align="L")
        pdf.ln(4)

        radar_style = FontFace(family="ArialVN", emphasis="B", size_pt=7.0, color=(255, 255, 255), fill_color=(30, 41, 59))
        with pdf.table(col_widths=(45, 26, 26, 29), headings_style=radar_style, line_height=4.5, padding=1.5) as r_tbl:
            rh = r_tbl.row()
            rh.cell("Trụ cột đánh giá", align="L")
            rh.cell(f"{target_ticker}", align="R")
            rh.cell("TB Ngành", align="R")
            rh.cell("Chênh lệch", align="R")

            for idx, cat in enumerate(cats):
                rrow = r_tbl.row()
                ts = t_scores[idx] if idx < len(t_scores) else 0
                is_ = i_scores[idx] if idx < len(i_scores) else 0
                diff = round(ts - is_, 1)
                diff_str = f"+{diff}" if diff > 0 else f"{diff}"
                rrow.cell(cat, align="L")
                rrow.cell(f"{ts}", align="R")
                rrow.cell(f"{is_}", align="R")
                rrow.cell(diff_str, align="R")

    # Cột Phải: Mô hình 5 lực lượng Porter & Catalysts (Rộng 136mm)
    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(149, current_y, 136, 160, "DF")

    pdf.set_xy(152, current_y + 2)
    pdf.set_font(pdf.font_family_bold, "B", 8.5)
    pdf.set_text_color(2, 132, 199)
    pdf.cell(130, 5, "2. MÔ HÌNH 5 LỰC LƯỢNG PORTER & CATALYSTS", align="L")
    pdf.ln(6)

    pdf.set_x(152)
    pdf.set_font(pdf.font_family_bold, "B", 7.5)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(130, 4, f"Chu kỳ ngành hiện tại: {cycle}", align="L")
    pdf.ln(5)

    force_labels = {
        "rivalry": "1. Mức độ cạnh tranh nội bộ ngành",
        "supplier_power": "2. Quyền lực nhà cung ứng",
        "buyer_power": "3. Quyền lực khách hàng",
        "substitution_threat": "4. Nguy cơ hàng thay thế",
        "new_entrants_threat": "5. Rào cản đối thủ mới gia nhập"
    }

    if forces:
        for k, v in forces.items():
            pdf.set_x(152)
            pdf.set_fill_color(255, 255, 255)
            pdf.set_draw_color(226, 232, 240)
            score = v.get("score", 3)
            badge_text = f"Mức {score}/5"

            pdf.set_font(pdf.font_family_bold, "B", 7.5)
            if score >= 4:
                pdf.set_text_color(185, 28, 28)
            elif score == 3:
                pdf.set_text_color(180, 83, 9)
            else:
                pdf.set_text_color(21, 128, 61)

            pdf.cell(100, 4, f"• {force_labels.get(k, k)}", align="L")
            pdf.cell(30, 4, badge_text, align="R")
            pdf.ln(4)

            pdf.set_x(155)
            pdf.set_font(pdf.font_family_regular, "", 7.0)
            pdf.set_text_color(71, 85, 105)
            desc = v.get("desc", "")
            pdf.multi_cell(125, 3.5, desc)
            pdf.ln(1.5)

    if catalysts:
        pdf.ln(2)
        pdf.set_x(152)
        pdf.set_font(pdf.font_family_bold, "B", 7.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(130, 4, "ĐỘNG LỰC TĂNG TRƯỞNG & CATALYSTS THEN CHỐT:", align="L")
        pdf.ln(4.5)
        for idx, c in enumerate(catalysts[:4]):
            pdf.set_x(155)
            pdf.set_font(pdf.font_family_regular, "", 7.0)
            pdf.set_text_color(51, 65, 85)
            pdf.multi_cell(125, 3.5, f"[{idx+1}] {c}")
            pdf.ln(1)

    if temp_img_path and os.path.exists(temp_img_path):
        try:
            os.remove(temp_img_path)
        except Exception:
            pass

    return bytes(pdf.output())

