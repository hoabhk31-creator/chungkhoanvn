# Institutional Equity Research Matrix (IERM) - Vietnam Fintech Terminal

**Institutional Equity Research Matrix (IERM)** là ứng dụng web tài chính chuyên nghiệp dành cho Chuyên viên Phân tích & Xử lý Dữ liệu Đầu tư Cấp cao (Senior Investment Research & Data Analyst). Ứng dụng tự động hóa toàn diện chu trình:

$$\text{Nhập Mã/Ngành} \longrightarrow \text{Thu thập Báo cáo (Vietstock / CafeF / CTCKs)} \longrightarrow \text{Bóc tách Định lượng} \longrightarrow \text{Ma trận So sánh Đa Tổ chức}$$

---

## 🌟 TÍNH NĂNG CỐT LÕI

### 1. Bảng Ma trận So sánh Đa Tổ chức (Matrix Consensus Table)
- Đối chiếu ngang trực diện giữa các CTCK lớn (SSI, HSC, Vietcap/VCSC, VNDirect, Mirae Asset, VCBS, KBSV, MBS).
- Tự động chuẩn hóa: Khuyến nghị, Giá mục tiêu, Upside %, P/E Forward, P/B Forward, Dự phóng Doanh thu & LNST, 3 Luận điểm tăng trưởng then chốt (Catalysts), và Rủi ro trọng yếu (Key Risks).
- Tính toán chỉ số đồng thuận thị trường: Giá mục tiêu bình quân (Mean), trung vị (Median), biên độ [Min - Max], và độ lệch định giá (Spread %).

### 2. Phân tích Chuyên sâu: Nguyên nhân - Kết quả - Bằng chứng (Causality Deep-Dive)
- Bóc tách theo cấu trúc logic: **Hiện tượng/Kết quả $\rightarrow$ Nguyên nhân cốt lõi (Nội tại & Ngoại sinh) $\rightarrow$ Bằng chứng số liệu kiểm chứng**.
- Động cơ tăng trưởng tương lai 1-3 năm: Tiến độ giải ngân dự án trọng điểm (Dung Quất 2, AI Factory, Bách Hóa Xanh...).

### 3. Bảng Phân hóa Quan điểm (Disensus Analysis - Bulls vs. Bears)
- Đối chiếu trực diện xung đột giả định giữa **Phe Lạc quan (Bulls)** và **Phe Thận trọng (Bears)** về sản lượng tiêu thụ, giá bán, biên lợi nhuận, và chính sách thuế/vĩ mô.

### 4. Chiến lược Hành động & Triggers Giám sát
- Khuyến nghị Consensus, vùng giá gom/mua, ngưỡng cắt lỗ (Stop-loss).
- **3 Catalyst Triggers then chốt** cần kiểm tra định kỳ hàng quý để đánh giá kịch bản của CTCK nào đang đi đúng hướng.

### 5. Cơ chế Ingestion Đa Kênh (Smart Fallback Pipeline)
- **Kênh 1:** Quét và tìm kiếm báo cáo phân tích theo mã từ Vietstock eDocs, CafeF, và cổng CTCK.
- **Kênh 2:** Nhập đường link URL trực tiếp (trang web hoặc file PDF online).
- **Kênh 3:** Kéo thả / Upload nhiều file PDF báo cáo phân tích cùng lúc (trích xuất nội dung bằng PyPDF).
- **Kênh 4:** Dán nội dung text thô từ báo cáo vào textarea để AI Engine bóc tách tự động.
- **Kênh 5:** Nút bấm 1-click trải nghiệm ngay các bộ dữ liệu thực tế mẫu: **HPG** (6 CTCK), **FPT** (4 CTCK), **MWG** (4 CTCK).

### 6. Tiện ích Xuất Báo Cáo Chuyên Nghiệp
- **Xuất Markdown:** Kết xuất file `.md` chuẩn theo đúng 4 phần báo cáo để gửi cho Hội đồng Đầu tư hoặc Nhà đầu tư.
- **Xuất CSV / Excel:** Tải file bảng ma trận định lượng.
- **Sao chép Tóm tắt (Clipboard):** Copy nhanh nội dung tóm tắt để dán vào Zalo/Telegram/Email.
- **In / Lưu PDF:** Chế độ in thân thiện cho báo cáo giấy hoặc PDF.

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY

### Khởi chạy 1-Click trên Windows:
Chạy file:
```cmd
start.bat
```
Hoặc qua dòng lệnh:
```bash
python run.py
```
Hệ thống sẽ tự động khởi động server tại `http://127.0.0.1:8000` và mở trình duyệt mặc định.

### Chạy kiểm tra tự động (Unit Test):
```bash
python -m unittest test_app.py
```

---

## 📂 CẤU TRÚC DỰ ÁN

```
e:/Anti/webapp/
│
├── server.py              # FastAPI Backend Server & Endpoints
├── engine.py              # Analytics Engine, Pydantic Models & Presets
├── crawler.py             # Data Ingestion, Scraper & PDF Parser
├── test_app.py            # Automated Unit Test Suite (6 tests)
├── run.py                 # Application Launcher & Browser Auto-open
├── start.bat              # Windows 1-Click Batch Launcher
├── README.md              # Documentation
│
└── static/
    ├── index.html         # Bloomberg-Style Terminal Dashboard UI
    ├── styles.css         # Dark Terminal Aesthetic & Print Styles
    └── app.js             # Client-side Logic, Table Rendering & State
```
