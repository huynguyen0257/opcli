# opcli

CLI tool để tương tác với OpenProject, hỗ trợ quản lý task, cập nhật trạng thái, log time và tạo branch từ task.

```
Không đi qua server trung gian
Không thu thập thông tin
Truy cập thẳng API OP
```
## Cài đặt

```bash
npm i -g @huynhthuc/opcli
```

Hoặc từ source:

```bash
git clone https://github.com/huynhthuchct/opcli.git
cd opcli
npm install
npm run build
npm link
```

Yêu cầu Node.js >= 18.

## Cấu hình

```bash
opcli config setup
```

Nhập URL OpenProject, username và password. Session được lưu tại `~/.opcli/config.json`.

## Sử dụng

### Danh sách task

```bash
# Task được gán cho mình
opcli tasks list

# Tìm kiếm theo tên/ID
opcli tasks list "keyword"

# Lọc theo status
opcli tasks list -s "In progress"

# Lọc theo người khác
opcli tasks list -a "username"

# Tất cả task (không lọc assignee)
opcli tasks list -a all
```

### Interactive search

```bash
# Search tasks của mình (live filter)
opcli tasks search

# Search tất cả tasks
opcli tasks search -a all
```

Gõ keyword → live filter theo subject, ID, status, priority, assignee → chọn task → action: View detail / Update / Comment / Create branch.

### Comment

```bash
opcli tasks comment <id> "Nội dung comment"
```

### Xem chi tiết task

```bash
opcli tasks view <id>

# Mở trên browser
opcli tasks view <id> --web

# Kèm activities
opcli tasks view <id> --activities

# Kèm relations
opcli tasks view <id> --relations

# Cả hai
opcli tasks view <id> --activities --relations
```

### Cập nhật task

```bash
# Interactive mode (chọn field để update)
opcli tasks update <id>

# Cập nhật status
opcli tasks update <id> -s "In progress"

# Cập nhật assignee
opcli tasks update <id> -a "username"
opcli tasks update <id> -a me

# Cập nhật ngày
opcli tasks update <id> --start 2026-03-12 --due 2026-03-15

# Cập nhật description
opcli tasks update <id> --description "Nội dung mới"

# Log time
opcli tasks update <id> --log-time 4 --log-date 2026-03-12 --log-comment "Nội dung"

# Kết hợp nhiều thay đổi
opcli tasks update <id> -s "In progress" --start 2026-03-12 --due 2026-03-15 --log-time 2
```

### Tạo branch từ task

```bash
# Mặc định prefix là feature
opcli tasks create-branch <id> <slug>
# → feature/op-<id>-<slug>

# Chỉ định prefix
opcli tasks create-branch <id> <slug> -p fix
# → fix/op-<id>-<slug>

# Ví dụ
opcli tasks create-branch 54379 fix-ad-clicks -p fix
# → fix/op-54379-fix-ad-clicks
```

Sau khi tạo branch, sẽ hỏi có muốn cập nhật task sang "In Process" không.

### Auto log time từ git branch

Tự động detect task ID từ branch name format `<prefix>/op-<id>-<slug>`.

```bash
# Interactive: hiện commits chưa log, chọn auto/manual hours
opcli log

# Log trực tiếp với số giờ
opcli log --hours 2
```

Flow:
1. Detect branch → extract task ID
2. Hiện danh sách commits chưa log
3. Chọn mode: Auto (tính từ timestamps) hoặc Manual (nhập giờ)
4. Confirm → log time → đánh dấu commits đã log

Trạng thái commits đã log được lưu tại `~/.opcli/logs/`.

### Git hooks & automation

Cài đặt git hooks và shell function để tự động hóa workflow.

```bash
# Cài tất cả hooks
opcli hook install

# Gỡ tất cả hooks
opcli hook uninstall
```

Sau khi cài, opcli sẽ thiết lập:

**Post-commit hook** — mỗi lần `git commit`:
- Nếu commit message chứa `done:` (không phân biệt hoa thường) → tự động cập nhật task sang "Developed"
- Hỏi nhập hours để log time (enter để skip)

**Post-checkout hook** — khi `git checkout -b feature/op-<id>-*` tạo branch mới, sẽ hỏi có muốn cập nhật task sang "In Process" không.

**`gpush` shell function** — thay thế `git push`, sau khi push thành công:
- Detect task ID từ branch name
- Kiểm tra commit cuối có chứa "WIP" không → nếu có thì skip
- Hỏi có muốn cập nhật task sang "Developed" và set due date hôm nay không

```bash
# Sử dụng gpush thay cho git push
gpush
gpush origin main
gpush --force-with-lease
```

Sau khi cài, cần `source ~/.zshrc` hoặc `source ~/.bashrc` (hoặc mở terminal mới) để kích hoạt `gpush`.

### Notifications

```bash
# Danh sách unread (mặc định 20)
opcli notifications list

# Giới hạn số lượng
opcli notifications list -n 10

# Tất cả (cả đã đọc)
opcli notifications list -a

# Đánh dấu đã đọc
opcli notifications read <id>

# Đánh dấu tất cả đã đọc
opcli notifications read --all
```

### Reminder

Hiện tổng quan task theo mức độ ưu tiên deadline.

```bash
# Mặc định hiện tasks due trong 3 ngày
opcli reminder

# Tasks due trong 7 ngày
opcli reminder -d 7
```

Thứ tự hiển thị:
1. 🔴 **Due today** — deadline hôm nay
2. 🟡 **Due soon** — sắp đến deadline
3. 🔵 **New** — task mới
4. 🔴 **Overdue** — quá hạn
5. ⚪ **Other** — còn lại

### Stats

Thống kê số giờ log time theo ngày trong tháng.

```bash
# Cá nhân — tháng hiện tại
opcli stats

# Chỉ định tháng/năm
opcli stats -m 2
opcli stats -m 1 -y 2025
```

Mỗi ngày hiện tổng giờ với màu: 🔴 <=4h, 🟡 <7h, 🟢 >=7h, kèm chi tiết task ID + hours.
Summary cuối tháng: tổng giờ, trung bình/ngày, work days, logged, missing.

#### Team Stats

```bash
# Team theo tháng — chi tiết từng ngày
opcli stats --team

# Team tổng hợp theo tuần
opcli stats --team -w

# Team chi tiết ngày trong tuần cụ thể
opcli stats --team -w 10

# Team tháng khác
opcli stats --team -m 2 -y 2026
```

`-w` không có số: bảng tổng hợp theo tuần. `-w <n>`: chi tiết từng ngày trong tuần đó.

### Alert

Nhắc nhở log time hàng ngày. Sau giờ chỉ định (mặc định 17:00), cron sẽ kiểm tra và gửi notification.

```bash
# Bật alert (cron chạy 17:00 weekdays)
opcli alert on

# Bật alert lúc 18:00
opcli alert on -h 18

# Tắt alert
opcli alert off

# Xem trạng thái
opcli alert status

# Kiểm tra thủ công
opcli alert check
```

Kết quả theo số giờ đã log:
- **>=8h** → 🎉 Great job!
- **>4h <8h** → 💪 Fighting!
- **<4h** → ⚠️ Consider logging more
- **0h** → 🔔 Don't forget!

Notification gửi qua `terminal-notifier` (cần `brew install terminal-notifier`) + luôn in ra terminal.


## Các status có sẵn

New, In specification, Specified, Confirmed, To be scheduled, Scheduled, In progress, Developed, In testing, Tested, Test failed, Closed, On hold, Rejected, Staging, Production, Fixed

## Development

```bash
npm run dev      # Watch mode
npm test         # Chạy test
npm run build    # Build TypeScrip

```
Ví dụ:
```
opcli git:(master) opcli tasks list
ID    | Status      | Priority  | Assignee               | Created    | Updated    | Subject
-------------------------------------------------------------------------------------------------------------------------------
54379 | New         | Immediate | thuchuynh@chidoanh.com | 2026-03-11 | 2026-03-12 | [DE] Lỗi 1 số product có giá trị field Ad Clicks và Ad Spend thấp hơn source GG + FB trên Melinda
54380 | In progress | Normal    | thuchuynh@chidoanh.com | 2026-03-11 | 2026-03-12 | [DE] Fix Bug Dynamic Mapping
54158 | Closed      | High      | thuchuynh@chidoanh.com | 2026-03-02 | 2026-03-12 | [Support] DE truyền thêm request_user_agent:conative trong các request đến Mizmooz và As98
54405 | Closed      | Normal    | thuchuynh@chidoanh.com | 2026-03-11 | 2026-03-12 | [Dynamic mapping][DE][AMZ] Lỗi  lệch số liệu ads spend, ads click ở conative so với  AMZ của org Purely Optimal 
54130 | Closed      | Normal    | thuchuynh@chidoanh.com | 2026-02-27 | 2026-03-12 | [Dynamic Mapping] [DE] Lỗi lệch data Summary giữa Production và Staging API List Product
54381 | Closed      | High      | thuchuynh@chidoanh.com | 2026-03-11 | 2026-03-12 | [Dynamic mapping][DE][AMZ] Lỗi  lệch số liệu tax và discount ở conative so với AMZ của org Purely Optimal
54369 | Closed      | High      | thuchuynh@chidoanh.com | 2026-03-10 | 2026-03-12 | [Dynamic mapping][DE][AMZ] Lỗi  lệch số liệu gross quantity, gross sale ở conative so với  AMZ của org Purely Optimal 
54134 | Closed      | Normal    | thuchuynh@chidoanh.com | 2026-02-27 | 2026-03-12 | [Dynamic Mapping] [DE] Lỗi lệch data Inventory giữa Production và Staging API List Product
54132 | Closed      | Normal    | thuchuynh@chidoanh.com | 2026-02-27 | 2026-03-12 | [Dynamic Mapping] [DE] Lỗi lệch data AI giữa Production và Staging API List Product
54407 | Rejected    | High      | thuchuynh@chidoanh.com | 2026-03-11 | 2026-03-12 | [Dynamic mapping][DE][AMZ] Lỗi  lệch số liệu product view ở org Annmarie 
54313 | In progress | Normal    | thuchuynh@chidoanh.com | 2026-03-06 | 2026-03-10 | [TECH-DM-001] DM_P4 - Research solution & Todo list
54360 | New         | Normal    | thuchuynh@chidoanh.com | 2026-03-10 | 2026-03-10 | [TECH-FAI-001] Phase 1 - Init Flow for AI Forecasting Automation
54292 | Closed      | Immediate | thuchuynh@chidoanh.com | 2026-03-05 | 2026-03-09 | [Rithum/OPS] - Lỗi data tax ở OPS cao hơn so với data service
54291 | Closed      | Immediate | thuchuynh@chidoanh.com | 2026-03-05 | 2026-03-09 | [Rithum/OPS] - Lỗi data return_value/return quantity ở OPS thấp hơn gấp đôi so với data service
54337 | Developed   | Normal    | thuchuynh@chidoanh.com | 2026-03-09 | 2026-03-09 | [Bearchop] Extend free trial to 31/06/2026
54311 | Closed      | Normal    | thuchuynh@chidoanh.com | 2026-03-06 | 2026-03-06 | Research how to implement Dynamic Injection Step
54070 | Closed      | High      | thuchuynh@chidoanh.com | 2026-02-24 | 2026-03-04 | [DE][Onboarding Daklac Farms Fruit] - Lỗi data list sales channel ở conative cao hơn so với AMZ
54206 | Developed   | High      | thuchuynh@chidoanh.com | 2026-03-03 | 2026-03-03 | [Noonday] Cập nhật trial đến 31.03.2026
54067 | In progress | High      | thuchuynh@chidoanh.com | 2026-02-24 | 2026-03-03 | [DE][Onboarding Daklac Farms Fruit] - Lỗi lệch data FC transfer quantity so với AMZ
54057 | Tested      | Immediate | thuchuynh@chidoanh.com | 2026-02-24 | 2026-02-26 | [Bearchop][BE]_Lỗi data sale ở conative nhỏ hơn so với source
53669 | Developed   | Normal    | thuchuynh@chidoanh.com | 2026-01-26 | 2026-02-12 | [TECH-04-004] Refactor ERP ETL All Platform Handling Stock Metric & Stock Metadata
52292 | Developed   | Normal    | thuchuynh@chidoanh.com | 2025-11-24 | 2026-02-12 | [TECH-DM-001] Phase 3 - Implement Ingest Step Mapping for SilverItem to TempItem
53724 | Developed   | Normal    | thuchuynh@chidoanh.com | 2026-01-27 | 2026-02-11 | [TECH-DM-001] Implement Dynamic mapping for ERP Platform
```

```
 opcli git:(master) ✗ opcli tasks view 45570 
#45570  [Amazon Seller] - DE Discovery metric of FBA Inventory

  Type:       Discovery
  Project:    Conative PaaS
  Status:     Developed
  Priority:   Normal
  Assignee:   thuchuynh@chidoanh.com
  Author:     huynguyen@chidoanh.com
  Progress:   0%
  Created:    2025-07-25
  Updated:    2025-07-30
  Start:      2025-07-28
  Due:        2025-07-29

Description:

1m| **Data cần lấy**        | **Note**                                                            |
| ----------------------- | ------------------------------------------------------------------- |
| Days of Supply          | ![ (https://devtak.cbidigital.com/api/v3/attachments/58401/content) |
| Recommended min. level  | ![](https://devtak.cbidigital.com/api/v3/attachments/58403/content) |
| FBA Recommended Restock | ![](https://devtak.cbidigital.com/api/v3/attachments/58402/content) |
| Reccomended Ship date   | ![](https://devtak.cbidigital.com/api/v3/attachments/58400/content) |
| Shipment Name           | ![](https://devtak.cbidigital.com/api/v3/attachments/58399/content) |
| Created Date            |                                                                     |
| Shipment Status         |                                                                     |
| Shipment Qty            |                                                                     |
| Shipment Item           |                                                                     |
| Ranking                 |                                                                     |
| Rating of product       |                                                                     |
| Product View            |                                                                     |
| Keyword of varaint      |                                                                     |
```