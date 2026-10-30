# Avalue PDF Tools

Bộ công cụ PDF tiếng Việt chạy trên GitHub Pages, xử lý nội dung tệp ngay trong trình duyệt.

## Công cụ

- **Gộp PDF**: sắp xếp và ghép nhiều tài liệu, giữ trang gốc.
- **JPG → PDF**: JPG/JPEG/PNG và PDF trong cùng danh sách; gộp hoặc xuất riêng; khổ ảnh gốc hoặc A4, chọn lề.
- **PDF → JPG**: ảnh riêng cho từng trang, chọn DPI/chất lượng và khoảng trang; tải riêng hoặc ZIP.
- **PDF → Word (.docx)**: văn bản chỉnh sửa được, OCR Việt/Anh cho bản scan, hoặc ảnh từng trang giữ hình thức.
- **Nén PDF**: chuyển trang thành JPEG, giữ kích thước trang vật lý; giữ bản gốc nếu kết quả không nhỏ hơn.

Chọn hoặc kéo thả tối đa 20 tệp, 50 MB/tệp, tổng 200 MB. Các tệp hiển thị dạng thẻ nằm ngang, có ảnh xem trước (trang đầu đối với PDF), số thứ tự và nút bỏ tệp. Kéo trái/phải hoặc dùng nút ← → để sắp xếp; nút hai bên cuộn hàng thẻ. Trên điện thoại, vuốt để cuộn, kéo tay nắm ⠿ để sắp xếp. Tay nắm cũng hỗ trợ phím mũi tên trái/phải. Khoảng trang như `1-3,5` áp dụng cho từng PDF. Tệp có mật khẩu phải được mở khóa trước. Nút dừng có hiệu lực sau thao tác đang thực hiện; kết quả đã tạo vẫn tải được.

## Giới hạn Word và nén

Word văn bản giữ chữ và ngắt trang, không tái dựng chính xác bảng, nhiều cột, phông và hình ảnh. Trang không có lớp chữ được đánh dấu để người dùng chuyển sang OCR. OCR phụ thuộc chất lượng bản scan; cần kiểm tra lại dấu, số và bố cục. Word chế độ ảnh chứa ảnh, chữ không chỉnh sửa được. Nén PDF làm mất lớp văn bản, vector, biểu mẫu và liên kết.

Trang lớn hơn giới hạn canvas sẽ báo lỗi để giảm DPI. Tài liệu dài vẫn có thể dùng nhiều RAM; nên chia nhỏ trên điện thoại.

## Triển khai

GitHub Pages phục vụ trực tiếp các tệp trong thư mục gốc từ nhánh `main`. Không cần bước build hoặc API key. Dùng HTTP/HTTPS để chạy, không mở trực tiếp bằng `file://`.

Mã chính: `index.html`, `styles.css`, `app.js`; thương hiệu: `logo.png`.

Thư viện ghim phiên bản: pdf-lib 1.17.1 (MIT), PDF.js 4.10.38 (Apache-2.0), JSZip 3.10.1 (MIT/GPL dual), Tesseract.js 5.1.1 (Apache-2.0). Trình duyệt tải thư viện từ CDN và OCR tải dữ liệu ngôn ngữ khi cần; nội dung tài liệu không được gửi tới máy chủ chuyển đổi. Kết quả lưu trong bộ nhớ tới khi đổi công cụ, xóa danh sách hoặc tải lại trang.

## Kiểm chứng

Đã kiểm tra bằng Chromium với tệp mẫu: gộp và đếm trang; ghép PNG/PDF; xuất riêng và đọc ZIP; JPG chọn trang và lỗi phạm vi; cấu trúc DOCX, chữ và ngắt trang; Word dạng ảnh; cảnh báo bản scan; OCR thực tế; nén và kích thước trang; A4; dừng xử lý; tên tệp an toàn; bố cục desktop/mobile; ảnh xem trước; kéo thả chuột và cảm ứng; cuộn ngang; thứ tự trang PDF sau khi kéo. Đây là kiểm tra với mẫu tổng hợp, không đảm bảo nhận dạng hoàn hảo mọi tài liệu.

Tham khảo quy trình sử dụng: https://jpg2pdf.com/vi/, https://pdftoimage.com/vi/, https://pdf2doc.com/vi/. Mã triển khai được viết mới, không sao chép dịch vụ.
