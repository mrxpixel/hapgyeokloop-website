// 신고 관리: 문제 신고와 개념카드 신고(question_reports.target_type='concept')를 구분한다.

export const isConceptReport = report => report?.target_type === 'concept';

// 목록 한 줄 요약. 개념카드는 카드 제목, 카드가 지워졌으면 target_id 를 그대로 보여 준다.
export function conceptReportLabel(report) {
  const title = report?.concept_title || report?.target_id || '알 수 없는 카드';
  return `개념 노트 · ${title}`;
}

// 개념노트 편집 화면(ConceptInspector)이 읽는 localStorage 값. 카드를 못 찾으면 null.
export function conceptInspectorJump(report) {
  if (!isConceptReport(report) || !report.concept_title) return null;
  const { concept_exam_code: examCode, concept_subject_code: subjectCode, concept_category_id: unitId, target_id: conceptId } = report;
  if (!examCode || !subjectCode || !unitId || !conceptId) return null;
  return { 'ci.examCode': examCode, 'ci.subjectCode': subjectCode, 'ci.unitId': unitId, 'ci.openId': conceptId };
}
