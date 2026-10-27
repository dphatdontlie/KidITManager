export const QUIZ_SKILLS = [
  { id: 'freeze', name: 'Đóng băng', description: 'Khóa trả lời của đội đối thủ trong 3 giây.' },
  { id: 'fire', name: 'Cầu lửa', description: 'Che một phần vùng đáp án của đối thủ trong 4 giây.' },
  { id: 'shield', name: 'Lá chắn', description: 'Chặn một đòn tấn công trong câu hiện tại.' },
];

export const SAMPLE_QUESTIONS = [
  { text: 'Thiết bị nào dùng để nhập chữ vào máy tính?', options: ['Màn hình', 'Bàn phím', 'Loa', 'Máy in'], correct: 1 },
  { text: 'Trong Scratch, khối lệnh “lặp lại” dùng để làm gì?', options: ['Xóa nhân vật', 'Đổi tên dự án', 'Thực hiện nhiều lần một nhóm lệnh', 'Tắt máy tính'], correct: 2 },
  { text: 'Một byte gồm bao nhiêu bit?', options: ['2', '4', '8', '16'], correct: 2 },
  { text: 'Khi nhận được đường link lạ yêu cầu mật khẩu, em nên làm gì?', options: ['Nhập ngay mật khẩu', 'Hỏi giáo viên hoặc người lớn đáng tin cậy', 'Chuyển cho tất cả bạn bè', 'Đăng mật khẩu lên nhóm'], correct: 1 },
];

export const blankQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0 });
export const phaseLabel = phase => ({ lobby: 'Chờ học sinh', question: 'Đang trả lời', reveal: 'Kết quả câu hỏi', finished: 'Đã kết thúc' })[phase] || phase;

export function roundChallenge(mode, index, count, seconds) {
  if (mode !== 'adventure') return { kind: 'classic', name: 'Vòng kiến thức', points: 100, seconds };
  if (index === count - 1 && count > 1) return { kind: 'final', name: 'Vòng quyết định', points: 200, seconds };
  if ((index + 1) % 3 === 0) return { kind: 'sprint', name: 'Thử thách tăng tốc', points: 150, seconds: Math.min(15, seconds) };
  return { kind: 'explore', name: 'Chinh phục kiến thức', points: 100, seconds };
}
