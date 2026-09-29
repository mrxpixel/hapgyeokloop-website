import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return textContent(node.props?.children);
}

function buttonsWithText(root, text) {
  return root.findAllByType('button').filter(button => textContent(button).includes(text));
}

function buttonWithText(root, text) {
  const [button] = buttonsWithText(root, text);
  assert.ok(button, `button containing "${text}" should render`);
  return button;
}

const question = {
  id: 'gongjungaesa_1_gaeron_35_01',
  subject_id: 'gongjungaesa_1_gaeron',
  year_session: 35,
  question_number: 1,
  stem: '원래 문제 지문',
  choices: [
    { id: 'A', text: '첫 번째 선지' },
    { id: 'B', text: '두 번째 선지' },
  ],
  correct_answer: 'A',
  correct_index: 0,
  explanation: '원래 해설',
  updated_at: '2026-09-28T00:00:00Z',
  admin_checked_at: null,
  check_status: 'unchecked',
};

const subject = {
  id: question.subject_id,
  code: 'gaeron',
  name: '부동산학개론',
  level: 1,
  file_code: 'GR',
  gemini_prompt_template: '{round}회 {number}번\n{stem}\n{choices}\n정답: {correct}\n해설: {explanation}',
};

const emptyDraftRpc = async () => [];

test('QuestionBlock common preview actions', async t => {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  t.after(() => server.close());
  const { QuestionBlock, ReportItem, buildGeminiPrompt } = await server.ssrLoadModule('/admin-sections.jsx');

  await t.test('opens the editor in place and cancel restores the preview draft', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(QuestionBlock, {
        q: question,
        subject,
        onSaved() {},
        onChanged() {},
        pushToast() {},
        draftRpc: emptyDraftRpc,
      }));
    });

    assert.equal(textContent(renderer.root.findByProps({ className: 'q-stem' })), question.stem);
    const choiceLabels = renderer.root.findAll(node => node.props.className === 'choice-id')
      .map(textContent);
    assert.deepEqual(choiceLabels, ['①', '②']);

    await act(async () => {
      buttonWithText(renderer.root, '편집').props.onClick();
    });
    assert.ok(buttonWithText(renderer.root, '취소'));
    assert.equal(buttonsWithText(renderer.root, 'Gemini에 보내기').length, 0);

    const stemTextarea = renderer.root.findAllByType('textarea')
      .find(textarea => textarea.props['aria-label'] === '텍스트 블록 1');
    assert.ok(stemTextarea);
    await act(async () => {
      stemTextarea.props.onChange({
        currentTarget: { style: {}, scrollHeight: 40 },
        target: { value: '저장하지 않을 지문' },
      });
    });

    await act(async () => {
      buttonWithText(renderer.root, '취소').props.onClick();
    });
    assert.equal(textContent(renderer.root.findByProps({ className: 'q-stem' })), question.stem);
    assert.ok(buttonWithText(renderer.root, 'Gemini에 보내기'));

    await act(async () => {
      buttonWithText(renderer.root, '편집').props.onClick();
    });
    const reopenedStem = renderer.root.findAllByType('textarea')
      .find(textarea => textarea.props['aria-label'] === '텍스트 블록 1');
    assert.equal(reopenedStem.props.value, question.stem);

    await act(async () => renderer.unmount());
  });

  await t.test('copies the generated Gemini prompt to the clipboard', async () => {
    const writeText = mock.fn(async () => {});
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    if (!globalThis.navigator) {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    }
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    let renderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(QuestionBlock, {
          q: question,
          subject,
          onSaved() {},
          onChanged() {},
          pushToast() {},
          draftRpc: emptyDraftRpc,
        }));
      });
      await act(async () => {
        await buttonWithText(renderer.root, 'Gemini에 보내기').props.onClick();
      });

      assert.equal(writeText.mock.callCount(), 1);
      assert.equal(writeText.mock.calls[0].arguments[0], buildGeminiPrompt(subject, question));
    } finally {
      if (renderer) await act(async () => renderer.unmount());
      if (!navigatorDescriptor) {
        delete globalThis.navigator;
      } else if (clipboardDescriptor) {
        Object.defineProperty(globalThis.navigator, 'clipboard', clipboardDescriptor);
      } else {
        delete globalThis.navigator.clipboard;
      }
    }
  });

  await t.test('disables Gemini when the subject has no template', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(QuestionBlock, {
        q: question,
        subject: { ...subject, gemini_prompt_template: null },
        onSaved() {},
        onChanged() {},
        pushToast() {},
        draftRpc: emptyDraftRpc,
      }));
    });

    const geminiButton = buttonWithText(renderer.root, 'Gemini에 보내기');
    assert.equal(geminiButton.props.disabled, true);
    assert.equal(geminiButton.props.title, '과목에 Gemini 템플릿 없음');
    await act(async () => renderer.unmount());
  });

  await t.test('loads, compares, and applies a saved explanation draft', async () => {
    const savedDraft = {
      id: 'draft-1',
      question_id: question.id,
      base_explanation: question.explanation,
      draft_explanation: '저장된 초안',
      direction_note: '표로 정리',
      status: 'draft',
      updated_at: '2026-09-29T00:00:00Z',
    };
    const draftRpc = mock.fn(async (name, params) => {
      if (name === 'admin_get_explanation_draft') return [savedDraft];
      if (name === 'admin_save_explanation_draft') {
        return [{
          ...savedDraft,
          draft_explanation: params.p_draft,
          direction_note: params.p_direction_note,
        }];
      }
      if (name === 'admin_apply_explanation_draft') {
        return [{
          ...savedDraft,
          draft_explanation: '수정한 초안',
          direction_note: '정의부터 정리',
          status: 'applied',
          applied_at: '2026-09-29T01:00:00Z',
        }];
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const onChanged = mock.fn();
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(QuestionBlock, {
        q: question,
        subject,
        onSaved() {},
        onChanged,
        pushToast() {},
        draftRpc,
      }));
    });

    assert.ok(textContent(buttonWithText(renderer.root, '변경안')).includes('초안 있음'));
    await act(async () => buttonWithText(renderer.root, '변경안').props.onClick());

    const draftTextarea = renderer.root.findByProps({ className: 'explanation-draft-textarea' });
    const directionTextarea = renderer.root.findByProps({ className: 'explanation-direction-textarea' });
    assert.equal(draftTextarea.props.value, savedDraft.draft_explanation);
    assert.equal(directionTextarea.props.value, savedDraft.direction_note);

    await act(async () => {
      draftTextarea.props.onChange({ target: { value: '수정한 초안' } });
      directionTextarea.props.onChange({ target: { value: '정의부터 정리' } });
    });
    await act(async () => {
      await buttonWithText(renderer.root, '반영…').props.onClick();
    });

    assert.ok(buttonWithText(renderer.root, '이대로 반영'));
    const saveCall = draftRpc.mock.calls.find(call => call.arguments[0] === 'admin_save_explanation_draft');
    assert.ok(saveCall);
    assert.deepEqual(saveCall.arguments[1], {
      p_question_id: question.id,
      p_draft: '수정한 초안',
      p_direction_note: '정의부터 정리',
    });

    await act(async () => {
      await buttonWithText(renderer.root, '이대로 반영').props.onClick();
    });

    assert.equal(textContent(renderer.root.findByProps({ className: 'exp-box' })), '수정한 초안');
    assert.equal(onChanged.mock.callCount(), 1);
    assert.equal(buttonsWithText(renderer.root, '초안 있음').length, 0);
    await act(async () => renderer.unmount());
  });

  await t.test('asks inside the panel before discarding unsaved edits', async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(QuestionBlock, {
        q: question,
        subject,
        onSaved() {},
        onChanged() {},
        pushToast() {},
        draftRpc: emptyDraftRpc,
      }));
    });

    await act(async () => buttonWithText(renderer.root, '변경안').props.onClick());
    const draftTextarea = renderer.root.findByProps({ className: 'explanation-draft-textarea' });
    await act(async () => draftTextarea.props.onChange({ target: { value: '저장하지 않을 초안' } }));
    await act(async () => buttonWithText(renderer.root, '닫기').props.onClick());

    assert.ok(buttonWithText(renderer.root, '변경 버리기'));
    assert.ok(renderer.root.findByProps({ className: 'explanation-draft-panel' }));
    await act(async () => buttonWithText(renderer.root, '변경 버리기').props.onClick());
    assert.equal(renderer.root.findAllByProps({ className: 'explanation-draft-panel' }).length, 0);
    await act(async () => renderer.unmount());
  });

  await t.test('offers an inline rebase when the live explanation changed', async () => {
    const savedDraft = {
      id: 'draft-conflict',
      question_id: question.id,
      base_explanation: question.explanation,
      draft_explanation: '충돌 뒤에도 유지할 초안',
      direction_note: '근거를 짧게',
      status: 'draft',
      updated_at: '2026-09-29T00:00:00Z',
    };
    const draftRpc = mock.fn(async (name) => {
      if (name === 'admin_get_explanation_draft') return [savedDraft];
      if (name === 'admin_apply_explanation_draft') {
        throw new Error('해설이 변경안 생성 이후 바뀌었습니다');
      }
      if (name === 'admin_rebase_explanation_draft') {
        return [{ ...savedDraft, base_explanation: '다른 운영자가 고친 현재 해설' }];
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const onChanged = mock.fn();
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(QuestionBlock, {
        q: question,
        subject,
        onSaved() {},
        onChanged,
        pushToast() {},
        draftRpc,
      }));
    });
    await act(async () => buttonWithText(renderer.root, '변경안').props.onClick());
    await act(async () => buttonWithText(renderer.root, '반영…').props.onClick());
    await act(async () => {
      await buttonWithText(renderer.root, '이대로 반영').props.onClick();
    });

    const rebaseButton = buttonWithText(renderer.root, '현재 해설 기준으로 다시 비교');
    await act(async () => {
      await rebaseButton.props.onClick();
    });

    const rebasedDiffText = renderer.root
      .findAll(node => node.props.className === 'explanation-diff-text')
      .map(textContent)
      .join('');
    assert.ok(rebasedDiffText.includes('다른 운영자가 고친 현재 해설'), rebasedDiffText);
    assert.equal(textContent(renderer.root.findByProps({ className: 'exp-box' })), '다른 운영자가 고친 현재 해설');
    assert.equal(onChanged.mock.callCount(), 0);
    assert.deepEqual(
      draftRpc.mock.calls.map(call => call.arguments[0]),
      [
        'admin_get_explanation_draft',
        'admin_get_explanation_draft',
        'admin_apply_explanation_draft',
        'admin_get_explanation_draft',
        'admin_rebase_explanation_draft',
      ],
    );
    await act(async () => renderer.unmount());
  });

  await t.test('does not apply a draft generation replaced after the card opened', async () => {
    const firstDraft = {
      id: 'draft-old',
      question_id: question.id,
      base_explanation: question.explanation,
      draft_explanation: '처음 본 초안',
      direction_note: '',
      status: 'draft',
      updated_at: '2026-09-29T00:00:00Z',
    };
    const replacementDraft = {
      ...firstDraft,
      id: 'draft-new',
      draft_explanation: '다른 운영자가 새로 만든 초안',
      updated_at: '2026-09-29T02:00:00Z',
    };
    let getCount = 0;
    const draftRpc = mock.fn(async (name) => {
      if (name === 'admin_get_explanation_draft') {
        getCount += 1;
        return [getCount === 1 ? firstDraft : replacementDraft];
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const onChanged = mock.fn();
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(QuestionBlock, {
        q: question,
        subject,
        onSaved() {},
        onChanged,
        pushToast() {},
        draftRpc,
      }));
    });
    await act(async () => buttonWithText(renderer.root, '변경안').props.onClick());
    await act(async () => buttonWithText(renderer.root, '반영…').props.onClick());
    await act(async () => {
      await buttonWithText(renderer.root, '이대로 반영').props.onClick();
    });

    const notice = renderer.root.findByProps({ className: 'explanation-draft-notice danger' });
    assert.ok(textContent(notice).includes('변경안이 다른 곳에서 바뀌었습니다'));
    assert.deepEqual(
      draftRpc.mock.calls.map(call => call.arguments[0]),
      ['admin_get_explanation_draft', 'admin_get_explanation_draft'],
    );
    assert.equal(onChanged.mock.callCount(), 0);
    assert.ok(buttonWithText(renderer.root, '이대로 반영'));
    await act(async () => renderer.unmount());
  });

  await t.test('renders the shared Gemini action inside ReportItem', async () => {
    const report = {
      report_id: 'report-1',
      reason: '정답 오류',
      detail: '확인해 주세요.',
      status: 'pending',
      created_at: '2026-09-28T00:00:00Z',
      subject_id: question.subject_id,
      year_session: question.year_session,
      question_number: question.question_number,
      question: {
        ...question,
        stem_givens: [],
      },
    };
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(ReportItem, {
        r: report,
        subject,
        open: true,
        selected: false,
        onToggle() {},
        onSelect() {},
        onChanged() {},
        pushToast() {},
        draftRpc: emptyDraftRpc,
      }));
    });

    const geminiButton = buttonWithText(renderer.root, 'Gemini에 보내기');
    assert.equal(geminiButton.props.disabled, false);
    await act(async () => renderer.unmount());
  });
});
