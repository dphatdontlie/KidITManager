# KidIT Manager

Ứng dụng quản lý học sinh, lớp học, lịch học, học phí và công giảng dạy. Frontend React/Vite, API Express trên Vercel, database MySQL/TiDB qua TLS.

## Giao diện chính đã chuyển theo bản duyệt

- Giao diện sổ điều phối KidIT nằm trong `src/redesign/`, dùng API và dữ liệu thật; không có thanh đổi vai trò hoặc dữ liệu minh họa.
- Giữ tên lớp hiện có, chọn buổi theo lịch và hai mẫu xuất PNG dành cho phụ huynh/giáo viên. Không thêm tên chương trình vào lớp.
- Học sinh có thể thuộc nhiều lớp; không chuyển/xóa các liên kết cũ khi sửa hồ sơ. Lớp không đặt sĩ số vẫn được giữ là không giới hạn.
- Công cá nhân, nháp/hủy, tổng công và dữ liệu cũ để đối chiếu được nối với API. Các công cụ cũ giữ đồng bộ đồng hồ, chuông, popup, danh sách lớp, bốc thăm, chia nhóm và bảng điểm.
- Sáng/tối lưu tùy chọn trên trình duyệt. Thư mục `giao-dien-moi/` được giữ để tham chiếu bản duyệt, không đưa lên hosting.
- `KIDIT_API_TARGET` chỉ dành cho máy phát triển khi cần nối API kiểm thử, không thay đổi URL API của bản build. Ví dụ: API trong bộ nhớ ở port 5001, Vite kiểm thử ở port 5175; bản chính mặc định API port 5000.

## Chạy trên máy

Yêu cầu Node.js 24 và database hiện có của ứng dụng.

1. Chạy `npm ci`.
2. Thông tin kết nối database cũ đã nằm trong `server/database-config.js`, được API và script migration dùng chung. Không cần tạo `.env` hoặc cấu hình `DB_*` trên Vercel.
3. Sao lưu database rồi chạy `npm run db:migrate` trên database thử nghiệm trước. Script tạo các bảng buổi dạy, tài khoản, phiên đăng nhập và công cá nhân; không xóa công cũ. Script tạo admin và tài khoản cho giáo viên chưa có tài khoản; chạy lại không đặt lại mật khẩu. Các bảng hiện có như `classes`, `teachers`, `teacher_attendance` phải tồn tại.
4. Mở hai terminal: chạy `npm run dev:api` và `npm run dev`.
5. Vào địa chỉ Vite hiển thị và đăng nhập. Admin mặc định: `admin` / `admin`. Giáo viên: họ tên không dấu viết liền, mật khẩu `kidit` (ví dụ Nguyễn Đăng Phát → `nguyendangphat`). Tên trùng được thêm số từ 2. Tên đăng nhập được hiển thị trong mục Giáo viên.

Không bật `INIT_DB` trên Vercel. Migration là bước riêng trước khi triển khai; không chạy DDL trong mỗi lần khởi động serverless.

## Buổi dạy và chấm công

1. Đăng nhập tài khoản giáo viên, vào **Lớp học → Chi tiết → Chấm công của tôi**.
2. Chọn ngày và suất từ danh sách lấy theo lịch lớp của ngày đó. Giờ bắt đầu/kết thúc đi theo suất, không nhập tùy ý. Nhập tên bài học và chọn vai trò dạy chính/trợ giảng.
3. Giáo viên được lấy từ phiên đăng nhập ở máy chủ, không được chấm hộ hoặc sửa công của người khác. Hai người cùng lớp, cùng suất tự chấm riêng.
4. **Mỗi người được 1 công cho một suất đã xác nhận**. Không nhập phút/giờ công; hệ thống chặn một người chấm trùng giờ, kể cả công từ buổi dạy cũ.
5. Chọn **Chưa xác nhận**, **Đã dạy, tính công**, hoặc **Đã hủy, không tính công**. Chỉ xác nhận sau giờ kết thúc theo giờ Việt Nam. Không hỗ trợ ca qua nửa đêm.
6. Vào **Chấm công** để lọc tháng/nhân sự, đối chiếu từng buổi và xuất CSV mở bằng Excel.

Số công được tính theo buổi, không phụ thuộc thời lượng. Giờ bắt đầu/kết thúc dùng để phân biệt ca, kiểm tra trùng lịch và xác nhận buổi đã kết thúc. Tiền lương tính theo đội hình thực tế của suất, lưu riêng theo từng bản ghi cá nhân:

| Đội hình | Mỗi giáo viên / buổi | Mỗi trợ giảng / buổi | Tổng chi phí / buổi |
| --- | ---: | ---: | ---: |
| 1 giáo viên | 1.500.000 / 8 = 187.500đ | 0đ | 187.500đ |
| 2 giáo viên | 1.500.000 / 8 = 187.500đ | 0đ | 375.000đ |
| 1 giáo viên + 1 trợ giảng | 1.000.000 / 8 = 125.000đ | 500.000 / 8 = 62.500đ | 187.500đ |
| 2 giáo viên + 1 trợ giảng | 1.500.000 / 8 = 187.500đ | 500.000 / 8 = 62.500đ | 437.500đ |

Form gợi ý đội hình từ phân công theo suất, cho phép sửa số người thực tế và xem lương cá nhân cùng tổng chi phí đội hình trước khi lưu. Đơn giá không phụ thuộc người khác đã tự chấm công hay chưa. Sửa lịch lớp không đổi đội hình đã lưu. Mỗi người phải đối chiếu đội hình của bản ghi mình với buổi thực tế. Với nhiều hơn 2 giáo viên, mỗi người dùng mức 187.500đ; mỗi trợ giảng dùng mức 62.500đ, tối đa 20 người/suất.

Trang Chấm công và CSV hiển thị đội hình, đơn giá, tiền lương và trạng thái. Công đã xác nhận cộng vào lương đã xác nhận; công nháp chỉ cộng vào tiền dự kiến; công hủy nhận 0đ. Bản ghi cá nhân cũ chưa có đội hình vẫn tính số công, nhưng báo chưa đủ dữ liệu để tính lương, không âm thầm coi là lương 0đ. Người sở hữu mở **Sửa công** để bổ sung đội hình thực tế. Công từ hệ thống buổi dạy cũ tính theo danh sách nhân sự đã lưu cùng buổi.

Trước khi triển khai code mới, chạy `npm run db:migrate:payroll` để tạo bảng `attendance_payroll`. Lệnh này chạy lại được, không sửa/xóa công cũ hay tài khoản. `npm run db:migrate` cũng bao gồm bảng này.

Các buổi dạy cũ được giữ nguyên, chỉ đọc, và vẫn được cộng theo từng nhân sự nếu đã xác nhận. Điểm danh giáo viên cũ thiếu giờ tiếp tục hiển thị riêng để đối chiếu, không tự cộng công.

Có thể sửa/hủy hoặc **Xóa buổi** chấm nhầm của mình. Xóa có hộp thoại xác nhận, xóa cả đội hình tính lương đi kèm, cập nhật tổng công/tiền và cho phép chấm lại cùng suất. Giáo viên khác và admin không được xóa hộ. Phiên bản bản ghi được kiểm tra cả khi sửa và xóa để chặn thao tác từ tab cũ. Sau khi lịch lớp đổi, bản ghi cũ vẫn giữ suất đã ghi nhận và có thể sửa bài học, trạng thái; đổi ngày/suất phải theo lịch mới.

## Quản lý tài khoản

- Thêm nhân sự ở mục Giáo viên tự tạo tài khoản trong cùng giao dịch. Mọi tài khoản giáo viên vẫn được quản lý lớp, giáo viên, học sinh, điểm danh học sinh, lịch học và các chức năng hiện có.
- Admin có mục **Tài khoản**: tạo nhanh giáo viên mới kèm tài khoản, tạo tài khoản cho hồ sơ chưa liên kết, đổi tên đăng nhập và mật khẩu. Đổi họ tên hồ sơ không tự đổi tên đăng nhập.
- Mật khẩu lưu bằng scrypt có salt; phiên đăng nhập dùng token ngẫu nhiên, cookie HttpOnly/SameSite, thời hạn 7 ngày. Đổi mật khẩu thu hồi các phiên của tài khoản đó. Admin có thể ghi/sửa công hộ bất kỳ giáo viên hoặc trợ giảng; giáo viên chỉ ghi/sửa công của mình.
- Bảng tổng công và xuất CSV công khai cho mọi tài khoản đã đăng nhập, gồm bài học và suất. Người chưa đăng nhập không truy cập API dữ liệu.

Điểm danh giáo viên kiểu cũ vẫn được giữ và hiển thị riêng trong bảng công để đối chiếu. Các dòng này chưa đủ giờ ca nên không tự cộng vào công mới. Điểm danh học sinh hiện vẫn theo ngày và độc lập với công giảng dạy.

## Ngày điểm danh học sinh theo lịch lớp

- Bắt đầu từ **01/10/2026 (thứ Năm)**, không có ngày trước mốc này trong phần chọn điểm danh.
- Chỉ chọn được đúng thứ có lịch học của lớp. Ví dụ, lớp học thứ Năm có các ngày 01, 08, 15, 22, 29 trong tháng 10/2026. Một lớp có hai ca cùng ngày vẫn có một ngày điểm danh học sinh.
- Đổi tháng/năm sẽ tự tính theo lịch thực tế, gồm cả năm nhuận. Lớp chưa có lịch thì không có ngày để điểm danh.
- Sửa lịch ở mục Lớp học có trường **Áp dụng lịch và phân công từ ngày**, mặc định hôm nay. Các ngày trước mốc này giữ lịch và đội hình cũ. Phiên bản áp dụng đến trước mốc kế tiếp; bổ sung một mốc quá khứ không ghi đè các phiên bản tương lai.
- Bộ chọn điểm danh, chấm công và lịch theo ngày tra đúng phiên bản có hiệu lực. Điểm danh hiển thị giáo viên và trợ giảng theo lịch của từng suất trong ngày đang chọn.
- Lịch cả tuần và hai ảnh xuất dùng tuần hiện tại, tra phân công riêng cho từng ngày (kể cả thay đổi giữa tuần).
- Công và đội hình thực tế đã lưu vẫn là căn cứ tính lương. Lịch mới không tự đổi công, vai trò, trạng thái xác nhận hoặc tiền lương cũ. Công thiếu đội hình cần người sở hữu mở **Sửa công** để bổ sung số giáo viên/trợ giảng thực tế.
- Trước khi triển khai, chạy `npm run db:migrate:schedule` để tạo bảng `class_schedule_history` (chạy lại được, không sửa dữ liệu cũ). `npm run db:migrate` cũng bao gồm bảng này.
- Lớp chưa có lịch sử dùng lịch hiện có làm mốc ban đầu từ 01/10/2026 khi sửa lần đầu. Phân công đã bị ghi đè trước khi có tính năng này không thể tự khôi phục; nhập lại phân công cùng ngày hiệu lực đúng để bổ sung lịch sử.

## Xuất thời khóa biểu

- Admin mở trang **Lịch dạy** sẽ thấy chế độ **Theo ngày**: nhập ngày/tháng/năm bằng ba ô riêng, dùng **Ngày trước**, **Hôm nay**, **Ngày sau** để chuyển lịch. Bảng chỉ hiện các lớp có lịch theo thứ của ngày được chọn, nhóm theo giờ và kèm giáo viên, trợ giảng, phòng học. Lọc người dạy áp dụng cho ngày đang xem.
- Ngày nhập sai/thiếu không hiển thị lịch và khóa nút lùi/tiến; nút Hôm nay giúp chọn lại. Điều hướng qua cuối tháng/năm và năm nhuận theo ngày lịch thực tế. Chuyển **Cả tuần** rồi quay về **Theo ngày** giữ ngày đang xem trong trang. Tài khoản giáo viên vẫn dùng lịch tuần.

- **Xuất ảnh**: giữ bản lịch học chỉ có tên lớp như trước.
- **Xuất TKB cho GV**: xuất thêm giáo viên (GV) và trợ giảng (TG) theo phân công mặc định của từng lớp. Các lớp trùng ca được tách rõ, người chưa được phân công có thông báo tương ứng. Tên file có thêm `GV_` để phân biệt.

## Công cụ hỗ trợ giảng dạy

Vào **Công cụ trên lớp** (`/tools`) từ menu. Bốn công cụ cá nhân dưới đây không cần thêm bảng database:

- **Đếm ngược giờ:** nhập phút/giây hoặc dùng mốc nhanh, bắt đầu/tạm dừng/tiếp tục, đặt lại, cộng thêm một phút, chuông và thông báo hết giờ. Có chế độ phóng to trong trang và popup riêng (`/tools/timer`). Popup đồng bộ cùng bộ đếm với trang chính trên cùng trình duyệt; trình duyệt cần cho phép cửa sổ bật lên. Đồng hồ vẫn giữ mốc kết thúc khi chuyển trang hoặc tải lại, kèm chỉ báo ở đầu trang. Có nút thử chuông; tại popup có thể nhấn thử chuông để bật âm thanh cho cửa sổ đó.
- **Bốc thăm học sinh:** nhập mỗi tên một dòng hoặc lấy từ danh sách lớp. Có chế độ không gọi lặp lại và bắt đầu lượt mới. Tên từ lớp kèm mã học sinh để phân biệt người trùng tên.
- **Chia nhóm:** chia ngẫu nhiên thành tối đa 20 nhóm, giữ đủ học sinh và cân bằng số lượng, sao chép kết quả hoặc chuyển nhóm thành bảng điểm mới (tối đa 10 đội).
- **Bảng điểm thi đua:** đổi tên, thêm/bỏ đội, cộng/trừ điểm, đưa điểm về 0; có thể xem thành viên nếu tạo từ nhóm.

Danh sách nhập và bảng điểm được lưu trên trình duyệt, không lưu vào database trung tâm. Lịch sử bốc thăm và kết quả chia nhóm giữ trong trang đang mở. Mỗi trình duyệt có dữ liệu công cụ riêng.

## Đấu trường trắc nghiệm nhiều máy

Vào **Công cụ trên lớp → Đấu trường trắc nghiệm** để tạo phòng, soạn câu hỏi và chia đội. Học sinh mở `/play`, nhập mã phòng và tên trên máy riêng; không cần tài khoản giáo viên. Có đóng băng, cầu lửa, lá chắn và bảng điểm theo đội.

Trước khi dùng trên hosting, chạy `npm run db:migrate:quiz` trên database của môi trường đó để thêm bảng phòng. Bản sửa này không tự chạy migration trong API. Hướng dẫn và giới hạn: [docs/QUIZ-ARENA.md](docs/QUIZ-ARENA.md).

Giao diện KidIT Arena có sảnh chờ, phù hiệu đội, đường đua điểm số, bốn đáp án màu, phím tắt 1–4, phản hồi đáp án và bục kết quả. Giáo viên có thể mở toàn màn hình. Hiệu ứng theo sự kiện có hỗ trợ giảm chuyển động và dùng được trên điện thoại.

Chế độ **Hành trình thử thách**: câu thường 100 điểm; mỗi câu thứ ba (trừ câu cuối) tối đa 15 giây và 150 điểm; câu cuối 200 điểm nếu bộ đề có ít nhất hai câu. Mỗi chuỗi ba câu đúng thưởng thêm 50 điểm. Máy chủ tính thời hạn, điểm và thưởng; chỉ công bố sau khi đóng câu. Chế độ **Cổ điển** và phòng cũ giữ luật 100 điểm/câu.

## Ghi chú lớp học và bàn điều hành

- Trước khi triển khai bản này, chạy `npm run db:migrate:notes` để tạo `class_notes` và `attendance_actions`. Lệnh chạy lại được và không thay đổi công/lương có sẵn. Migration đầy đủ cũng bao gồm hai bảng.
- Mỗi lớp có tab **Ghi chú buổi học**, lưu văn bản tối đa 10.000 ký tự theo ngày, loại (giảng dạy/chi tiêu/khác), người viết và trạng thái theo dõi. Chi tiêu có số tiền tùy chọn, không tự khấu trừ vào lương hoặc học phí.
- Giáo viên xem ghi chú trong từng lớp, sửa ghi chú của mình; admin xem tổng hợp và sửa mọi ghi chú. Khi hai người cùng sửa, phiên bản cũ bị chặn để tránh ghi đè.
- Trang tổng quan admin hiển thị lương theo nhân sự, công nháp, công thiếu đội hình, chi phí đã ghi chú, lịch hôm nay và sổ ghi chú toàn trung tâm có bộ lọc tháng/lớp/loại/trạng thái/nội dung.
- Admin vào **Chấm công cho giáo viên** trên dashboard, sổ công hoặc trang lớp, chọn nhân sự, suất, vai trò và đội hình thực tế. Kiểm tra trùng giờ, xác nhận sau giờ dạy và tính lương vẫn dùng cùng quy tắc. Thao tác tạo/sửa hộ được lưu nguyên tử vào lịch sử, và bảng công hiển thị người ghi hộ gần nhất.
- Quay về tab trình duyệt không gọi lại dữ liệu quản lý. Lịch và bảng công giữ ngày xem, bộ lọc khi chuyển trang trong phiên đăng nhập. Dùng **Cập nhật lịch**, **Tải lại** hoặc **Cập nhật dữ liệu** để lấy thông tin từ máy khác. Sau khi lưu vẫn cập nhật ngay phần vừa sửa; phòng đấu vẫn đồng bộ trực tiếp để trận đấu không bị gián đoạn.

## Đưa bản sửa lên Vercel

1. Thông tin kết nối nằm sẵn trong `server/database-config.js` theo yêu cầu chủ ứng dụng. Khi đổi database, sửa file này.
2. Không cần thêm biến môi trường database trên Vercel. File cấu hình chỉ được import bởi code phía máy chủ, không đưa vào frontend.
3. Sao lưu database và chạy migration trên đúng database bằng `npm run db:migrate`. Kiểm tra thêm `accounts`, `account_sessions`, `personal_attendance`, bên cạnh các bảng buổi dạy hiện có.
4. Chạy `npm test`, `npm run lint`, `npm run build`, `npm audit`.
5. Commit các thay đổi cần triển khai và đẩy lên repository liên kết với Vercel hoặc dùng quy trình deploy hiện có. Build command: `npm run build`; output: `dist`. Giữ `vercel.json` để `/api/*` về Express và các đường dẫn frontend về SPA.
6. Sau deploy, thử bằng cửa sổ riêng tư: yêu cầu đăng nhập trước khi xem dữ liệu; kiểm tra admin quản lý tài khoản, giáo viên tự chấm công, hai tài khoản cùng suất ghi công riêng và xem bảng tổng trên môi trường thử nghiệm trước khi nhập công thật.

Phiên đăng nhập được lưu trong database, không cần khóa phiên dùng chung qua biến môi trường.

`git rm --cached` đã bỏ theo dõi các dump SQL, file `.db` và `sqlite.zip`; bản gốc vẫn ở máy. `.gitignore` và `.vercelignore` ngăn đưa các file đó vào những bản mới. Database từ xa vẫn được giữ nguyên.

## Kiểm tra tự động và giao diện

- `npm test`: kiểm tra đăng nhập, phân quyền admin, tạo/đổi tài khoản, thu hồi phiên, chấm công cá nhân, hai giáo viên cùng ca, chống chấm hộ/trùng giờ, suất theo lịch, bảng tổng, dữ liệu công cũ và các công cụ giảng dạy.
- Các test API dùng SQLite trong bộ nhớ với adapter giao diện MySQL. Chúng kiểm tra hành vi và giao dịch của route, chưa thay thế chạy migration và kiểm tra khóa đồng thời trên MySQL/TiDB thật.
- `node scripts/test-server.js` + `npm run dev`: chạy giao diện dùng trực tiếp với dữ liệu giả trong bộ nhớ, không kết nối database thật. Dừng server fixture trước khi chạy API thật vì cùng dùng port 5000.
- Báo cáo rà soát và các giới hạn còn lại: [docs/APP-REVIEW-2026-10-15.md](docs/APP-REVIEW-2026-10-15.md).
