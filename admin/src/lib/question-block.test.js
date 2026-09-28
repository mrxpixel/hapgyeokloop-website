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
      }));
    });

    const geminiButton = buttonWithText(renderer.root, 'Gemini에 보내기');
    assert.equal(geminiButton.props.disabled, true);
    assert.equal(geminiButton.props.title, '과목에 Gemini 템플릿 없음');
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
      }));
    });

    const geminiButton = buttonWithText(renderer.root, 'Gemini에 보내기');
    assert.equal(geminiButton.props.disabled, false);
    await act(async () => renderer.unmount());
  });
});
