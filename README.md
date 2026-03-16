# opcli

CLI tool để tương tác với OpenProject, hỗ trợ quản lý task, cập nhật trạng thái, log time và tạo branch từ task.

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

**Post-commit hook** — mỗi lần `git commit` sẽ hỏi nhập hours để log time (enter để skip).

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

### Focus

Theo dõi hoạt động và nhắc nhở khi idle quá lâu (chuột/bàn phím không hoạt động).

```bash
# Bật focus monitor (mặc định 10 phút)
opcli focus on

# Bật với threshold 15 phút
opcli focus on -i 15

# Tắt focus monitor
opcli focus off

# Xem trạng thái
opcli focus status
```

Khi idle vượt threshold, sẽ gửi notification nhắc quay lại làm việc. Tự động reset khi phát hiện hoạt động trở lại.

Yêu cầu macOS (sử dụng `ioreg` để detect idle time).

## Các status có sẵn

New, In specification, Specified, Confirmed, To be scheduled, Scheduled, In progress, Developed, In testing, Tested, Test failed, Closed, On hold, Rejected, Staging, Production, Fixed

## Development

```bash
npm run dev      # Watch mode
npm test         # Chạy test
npm run build    # Build TypeScript
```
