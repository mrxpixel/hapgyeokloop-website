// 공지 대상 시험. null = 공통(모든 시험에 노출). 앱의 kAnnouncementExamNames 와 같은 표.
export const ANNOUNCEMENT_EXAMS = [
  { id: null, label: '공통' },
  { id: 'gongjungaesa', label: '공인중개사' },
  { id: 'gampyeongsa', label: '감정평가사' },
];

const LABELS = Object.fromEntries(ANNOUNCEMENT_EXAMS.filter(e => e.id).map(e => [e.id, e.label]));

// 목록 배지용 표시명. 빈 값·null 은 공통.
export function announcementExamLabel(examId) {
  if (!examId) return '공통';
  return LABELS[examId] || examId;
}

// 생성/수정 RPC 로 보낼 값. 공통은 null 로 보낸다(빈 문자열 금지).
export function announcementExamParam(examId) {
  return examId ? examId : null;
}
