# KidIT Manager

## Web Push cho iPhone và trình duyệt

Backend Web Push dùng VAPID, không cần tài khoản Apple Developer. Các API `/api/push/*` yêu cầu đăng nhập, chỉ quản lý đăng ký của phiên hiện tại. Đăng xuất hoặc đổi mật khẩu xóa phiên và đăng ký liên quan. Không gửi lại thông báo sau khi phiên hết hạn; người dùng cần bật lại sau lần đăng nhập mới. Endpoint hết hạn (404/410) bị xóa khi gửi thử; lỗi tạm thời giữ đăng ký để thử lại. Gửi thử giới hạn mỗi thiết bị 30 giây/lần, TTL 60 giây. Nội dung thử không có dữ liệu học sinh hay tiền lương.

Chuẩn bị server:

1. Chạy `npm ci` và `npm run db:migrate:push` để tạo riêng bảng đăng ký thông báo. Lệnh chỉ thêm bảng, không sửa dữ liệu hiện có; migration tổng cũng bao gồm bảng này. Trên Vercel, `buildCommand` chạy riêng migration này trước khi build giao diện; nếu MySQL không kết nối được hoặc migration lỗi, deployment dừng và bản production trước đó vẫn được giữ. Migration có thể chạy lại an toàn và chỉ tạo các bảng Push còn thiếu, không chạy migration lương hay đổi tài khoản. `.vercelignore` cho phép gửi riêng file SQL này để Vercel CLI cũng build được.
2. Chạy `npm run push:keys` để tạo khóa vào `.env` đã được Git bỏ qua. Script không in khóa và từ chối ghi đè khóa đang có. Giữ nguyên cặp khóa khi triển khai các bản mới.
3. Đặt `PUSH_VAPID_SUBJECT=mailto:email-quan-tri` hoặc URL HTTPS liên hệ của trung tâm trong `.env`. Trên hosting, cấu hình `PUSH_VAPID_SUBJECT`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` và `CRON_SECRET` rồi triển khai lại. Script tạo khóa cũng tạo `CRON_SECRET` ngẫu nhiên nếu chưa có. Không thêm tiền tố `VITE_`, không gửi khóa riêng vào chat, không commit `.env`.
4. Triển khai qua HTTPS. Server có thể gửi HTTPS ra Apple Push, FCM và Mozilla Push. Chỉ hỗ trợ endpoint của các dịch vụ trình duyệt được liệt kê trong `server/push.js` để tránh gửi tới địa chỉ mạng tùy ý.

`public/sw.js` xử lý push và mở đường dẫn cùng website khi bấm thông báo. Service worker không cache trang, API, thông tin đăng nhập hoặc dữ liệu trung tâm; bản này không cung cấp chế độ offline.

Sau khi triển khai, mở **Thông báo** trong menu. Trên iPhone/iPad iOS 16.4+, mở web trong Safari → Chia sẻ → Thêm vào Màn hình chính; mở icon KidIT, vào **Thông báo → Bật thông báo → Cho phép** rồi bấm **Gửi thông báo thử**. iOS yêu cầu thao tác trực tiếp để xin quyền, không tự hiện hộp thoại khi tải trang. Manifest chạy standalone; icon iOS dùng lại `public/logo.png`. Icon SVG trên trình duyệt khác là chữ KI tạm thời theo brand mark hiện tại, có thể thay bằng icon PNG vuông được duyệt sau. Không có dữ liệu được cache offline.

### Nhắc trước giờ dạy

Giáo viên chọn nhắc trước **5, 15 hoặc 30 phút**, mặc định 15 phút, trong trang Thông báo. Thiết lập áp dụng cho tài khoản; bật/tắt nhận áp dụng riêng cho thiết bị và phiên đăng nhập. Admin chưa liên kết giáo viên chỉ nhận được thông báo thử. Bộ nhắc dùng ngày và giờ Việt Nam, lịch có hiệu lực theo ngày và phân công từng suất; hỗ trợ cả giáo viên và trợ giảng. Tên nhân sự khớp chính xác sau khi chuẩn hóa Unicode/chữ hoa/thường; tên trùng nhiều giáo viên sẽ được bỏ qua để tránh gửi nhầm. Chưa có dữ liệu lịch nghỉ hoặc buổi ngoại lệ để tự bỏ qua; không gửi thay đổi lịch như một thông báo riêng.

**Bắt buộc cấu hình tác vụ chạy mỗi phút ở server**, chọn một trong hai cách:

- Server Node chạy liên tục: dùng process manager/service để chạy `npm run push:worker`. Lệnh đọc `.env`, kiểm tra lịch mỗi phút và dừng khi nhận SIGINT/SIGTERM. Có thể dùng `npm run push:worker -- --once` để chạy một lượt.
- Hosting serverless: dịch vụ cron gọi `GET https://<domain-kidit>/api/cron/push-reminders` mỗi phút, kèm header `Authorization: Bearer <CRON_SECRET>`. Khóa tối thiểu 32 ký tự và giữ riêng. Endpoint cron không dùng cookie đăng nhập. Không cấu hình gọi tự động trong trình duyệt người dùng. Nếu dùng Vercel Pro có thể thêm `{"path":"/api/cron/push-reminders","schedule":"* * * * *"}` vào mảng `crons` trong `vercel.json`; Vercel tự gửi `CRON_SECRET` qua Authorization. Không thêm mặc định vì Vercel Hobby không hỗ trợ cron mỗi phút; cấu hình đó làm deployment Hobby thất bại. [Giới hạn cron Vercel](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

Trang Thông báo hiện cảnh báo khi server chưa ghi nhận lượt chạy trong 3 phút gần đây. Chỉ việc lưu thời gian nhắc chưa khởi động được scheduler. Health này ghi nhận lần kiểm tra lịch gần nhất, không phải xác nhận thông báo đã đến thiết bị.

Mỗi thiết bị/suất/ngày chỉ được claim một lần bằng khóa duy nhất ở database, kể cả nhiều cron chạy chồng nhau. Lỗi gửi tạm thời bỏ claim để cron sau thử lại trong cửa sổ 5 phút sau giờ nhắc; endpoint 404/410 bị xóa. Không gửi nếu đã đến giờ dạy, phiên hết hạn hoặc thiết bị đã tắt. Push được giữ tối đa đến giờ bắt đầu, lịch sử claim được dọn sau 7 ngày. Chạy lại sau khi worker bị dừng đột ngột có thể bỏ lỡ lượt đã claim; lỗi mạng sau khi dịch vụ nhận có thể tạo bản gửi lại, notification tag giúp gộp cùng suất. Web Push không bảo đảm đến đúng phút và có thể bị Tập trung/mất mạng chặn. Luôn xem lịch trong KidIT để xác nhận giờ.

Nội dung nhắc trên màn hình khóa chỉ gồm tên lớp, giờ bắt đầu và phòng, không gửi tên học sinh hoặc tiền lương. Nhấn thông báo mở chi tiết lớp trên cùng website và vẫn kiểm tra đăng nhập. Bản thử trên localhost dùng fixture/mocked transport, không chứng minh giao nhận APNs; phải thử trên iPhone thật qua HTTPS trước khi đưa vào sử dụng.

Tài liệu chuẩn: [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [web-push](https://github.com/web-push-libs/web-push).

## Trợ lý điều phối AI

Admin mở **Trợ lý điều phối** (`/assistant`) để hỏi lịch theo ngày, bài học từng suất, suất đã kết thúc chưa có tên bài trong công xác nhận và đề xuất buổi học bổ sung một lần. Mỗi lượt tra tối đa 31 ngày, kèm liên kết về lớp/lịch và thời điểm tra dữ liệu. Cuộc trò chuyện chỉ giữ trong trang hiện tại, không lưu vào database.

- Máy chủ dùng các công cụ chỉ đọc, hỗ trợ OpenRouter Chat Completions hoặc OpenAI Responses; AI không nhận trường mật khẩu, số điện thoại hay dữ liệu tiền lương. Tên lớp/nhân sự, câu hỏi và ghi chú giảng dạy có thể được gửi khi tra cứu. Không cần migration mới.
- Sao chép `.env.example` thành `.env`, đặt `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY` và `OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free`. Dùng khóa mới nếu khóa trước đó đã chia sẻ trong chat. `npm run dev:api` đọc `.env` trên Node 22+; không thêm tiền tố `VITE_` cho các biến này. Trên Vercel, đặt các biến trong Environment Variables rồi triển khai lại. Không nhập khóa vào chat hoặc commit `.env`.
- Có thể chọn `AI_PROVIDER=openai` với `OPENAI_API_KEY` và `OPENAI_MODEL` để dùng kết nối OpenAI hiện có. Chỉ một nhà cung cấp được dùng mỗi lượt, không tự chuyển qua model trả phí.
- Endpoint Nemotron miễn phí có thông báo không tải thông tin bí mật hoặc dữ liệu cá nhân và có ghi log. Chỉ dùng dữ liệu giả để thử endpoint này; với dữ liệu trung tâm thật, chọn endpoint và chính sách dữ liệu phù hợp trước khi kích hoạt. Không suy rằng dữ liệu được bảo vệ bởi chính sách OpenAI khi dùng OpenRouter. [Thông báo endpoint](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free).
- Khi chưa cấu hình, trang hiển thị hướng dẫn kết nối và khóa gửi câu hỏi. Giới hạn 6 câu/phút/tài khoản, 1 yêu cầu đang xử lý/tài khoản, tối đa 3 yêu cầu/tiến trình; bộ giới hạn trong bộ nhớ không phải hạn mức toàn cục giữa các Vercel instance. Đặt thêm hạn mức chi tiêu tại nhà cung cấp cho môi trường công khai.
- Lịch tra đúng phiên bản ngày hiệu lực. Bài học lấy từ công cá nhân; công nháp/hủy/cũ được phân biệt, các bài khác nhau giữa nhiều người được đánh dấu chưa thống nhất. Ghi chú là theo ngày, không thuộc riêng một suất. Chưa ghi bài học không có nghĩa chưa dạy.
- Đề xuất chỉ dành cho buổi bổ sung một lần, chưa lưu. Cần chỉ rõ lớp, nhân sự, phòng, khoảng ngày và khung giờ. Hệ thống kiểm tra lịch lớp, phòng, nhân sự, học sinh chung lớp và công đã ghi. Phòng/nhân sự trong lịch cũ có thể còn thiếu hoặc là tên tự do; chưa có lịch rảnh, nghỉ phép, di chuyển, danh mục phòng hay buổi nghỉ ngoại lệ. Kết quả chỉ khẳng định không trùng dữ liệu đã ghi nhận. Thêm lịch tuần qua **Thông tin lớp** như hiện tại.
- OpenRouter dùng công cụ Chat Completions và giữ nguyên `reasoning_details` trên máy chủ giữa các bước gọi công cụ, không gửi nội dung suy luận về giao diện. Hiện dùng phản hồi hoàn chỉnh (`stream: false`) để kiểm tra đủ kết quả tra cứu. `store: false` chỉ áp dụng cho kết nối OpenAI; chính sách log/lưu dữ liệu tùy nhà cung cấp. Tài liệu: [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling), [Reasoning details](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).


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

Trong trang **Chấm công**, admin có tab **Tổng thanh toán**: tổng hợp toàn bộ lớp theo tháng, từng giáo viên/trợ giảng có số suất đã xác nhận, lương theo suất, thưởng và tổng nhận. Bấm **+ Thưởng** để nhập tổng thưởng của người đó trong tháng, kèm ghi chú tùy chọn; nhập 0 để điều chỉnh về không thưởng. Khoản thưởng lưu riêng từng tháng, có kiểm tra phiên bản và ghi người cập nhật; giáo viên không được đọc/sửa API thưởng. Suất nháp/hủy không cộng lương; suất thiếu đội hình hiển thị tổng nhận tạm tính. Có xuất CSV theo nhân sự đang lọc. Trước triển khai, chạy `npm run db:migrate:bonuses` (migration `009-payroll-bonuses.sql`, không thay đổi lương/công có sẵn).

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

## Cấu hình phát lương theo lớp

- Với database đã có bảng đơn giá, chạy `npm run db:migrate:flexible-payroll` trước khi triển khai. Với database mới, dùng `npm run db:migrate` để tạo đầy đủ bảng. Migration chạy lại được, giữ nguyên tiền của công đã xác nhận theo cách tính trước khi cập nhật, kể cả buổi dạy cũ.
- Admin vào **Chấm công → Phát lương**, nhập ngân sách mỗi suất, tiền mỗi giáo viên có trợ và tiền mỗi trợ giảng. Hai cột **giáo viên không có trợ** và **một người thay hai giáo viên** là tùy chọn. Trống: dùng quy tắc kế tiếp; nhập 0: nhận 0đ. Tổng tiền suất chỉ để đối chiếu ngân sách, không tự chia hoặc chuyển tiền.
- Thứ tự chọn tiền cho mỗi người: đơn giá riêng của lượt công → một người thay hai giáo viên (nếu chọn tình huống này và thực tế đúng một giáo viên) → giáo viên không trợ (nếu số trợ thực tế bằng 0) → đơn giá giáo viên thông thường. Mỗi trợ giảng nhận đơn giá trợ riêng. Hai giáo viên cùng dạy đều nhận đơn giá mỗi người; không tự chia đôi.
- Đơn giá theo ngày bắt đầu áp dụng; có thể đặt trước hoặc sửa một mốc trong lịch sử. Ví dụ từ ngày 01/10 giáo viên không trợ nhận 187.500đ, có trợ nhận 125.000đ và trợ nhận 62.500đ: chỉ buổi thực tế có trợ mới dùng 125.000đ. Thêm trợ vào lịch lớp không tự đổi đội hình hoặc tiền của công cũ.
- Đội hình ghi theo từng lượt công, kể cả người chưa tự chấm. Các lượt cùng lớp/ngày/giờ khai khác đội hình có cảnh báo đối chiếu. Mục một người thay hai giáo viên cần được chọn rõ ràng, không suy từ lịch lớp hiện tại.
- Admin có thể nhập đơn giá riêng và lý do cho từng lượt. Công đã xác nhận lưu số tiền đã chốt; chỉnh ghi chú/đội hình không tự thay tiền. Admin chọn **Tính lại** khi sửa công hoặc vào Phát lương, chọn tối đa 200 công, xem số tiền trước/sau rồi xác nhận. Sửa nhiều công được thực hiện nguyên tử, có lịch sử và kiểm tra phiên bản/đơn giá thay đổi trong lúc duyệt.
- Công nháp tính dự kiến theo đơn giá ngày dạy; công hủy nhận 0đ; tiền đã xác nhận cộng vào Tổng thanh toán và CSV. Lớp/ngày chưa cấu hình dùng quy tắc đội hình cũ. Công cũ trước tài khoản cá nhân được giữ nguyên để đối chiếu, không tham gia chức năng sửa công/tính lại hiện hành.

## Kiểm tra tự động và giao diện

- `npm test`: kiểm tra đăng nhập, phân quyền admin, tạo/đổi tài khoản, thu hồi phiên, chấm công cá nhân, hai giáo viên cùng ca, chống chấm hộ/trùng giờ, suất theo lịch, bảng tổng, dữ liệu công cũ và các công cụ giảng dạy.
- Các test API dùng SQLite trong bộ nhớ với adapter giao diện MySQL. Chúng kiểm tra hành vi và giao dịch của route, chưa thay thế chạy migration và kiểm tra khóa đồng thời trên MySQL/TiDB thật.
- `node scripts/test-server.js` + `npm run dev`: chạy giao diện dùng trực tiếp với dữ liệu giả trong bộ nhớ, không kết nối database thật. Dừng server fixture trước khi chạy API thật vì cùng dùng port 5000.
- Báo cáo rà soát và các giới hạn còn lại: [docs/APP-REVIEW-2026-10-15.md](docs/APP-REVIEW-2026-10-15.md).
