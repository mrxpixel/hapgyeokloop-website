import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownEditor from './components/MarkdownEditor.jsx'

const seedMarkdown = `# 마크다운 에디터 데모

본문에서 **굵은 텍스트**를 포함한 문단입니다.

- 첫 번째 항목
- 두 번째 항목

| 항목 | 값 |
| --- | --- |
| A | 1 |
| B | 2 |`

function Demo() {
  const [value, setValue] = useState(seedMarkdown)

  return (
    <main className="demo-shell">
      <div className="demo-head">
        <div>
          <h1>MarkdownEditor Demo</h1>
          <p>/markdown-demo.html · dev only</p>
        </div>
      </div>
      <div className="demo-grid">
        <MarkdownEditor
          value={value}
          onChange={setValue}
          placeholder="내용을 입력하세요..."
        />
        <section className="demo-output">
          <h2>Live markdown output</h2>
          <pre>{value}</pre>
        </section>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<Demo />)
