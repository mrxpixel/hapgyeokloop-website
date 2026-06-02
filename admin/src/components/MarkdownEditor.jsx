import React, { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import './markdown-editor.css'

marked.setOptions({ gfm: true, breaks: false })

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
td.use(gfm)

function mdToHtml(md) {
  return marked.parse(md || '')
}

function htmlToMd(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // <colgroup> breaks turndown-plugin-gfm header detection — drop it.
  doc.querySelectorAll('colgroup').forEach(el => el.remove())
  // Flatten <p> inside table cells so GFM rows stay single-line.
  doc.querySelectorAll('th, td').forEach(cell => {
    const ps = cell.querySelectorAll(':scope > p')
    if (ps.length) {
      cell.innerHTML = Array.from(ps).map(p => p.innerHTML.trim()).join('<br>')
    }
  })
  return td.turndown(doc.body.innerHTML).trim()
}

function normalizeMd(md) {
  return (md || '').trim()
}

function MarkdownTextarea({ value, onChange, placeholder, compact }) {
  return (
    <textarea
      className="field-input"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '내용을 입력하세요…'}
      style={{ width: '100%', minHeight: compact ? 90 : 160 }}
    />
  )
}

function ToolbarButton({ active, children, onClick, disabled, title }) {
  return (
    <button
      type="button"
      className={`btn btn-xs${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}

function TiptapMarkdownEditor({ value, onChange, placeholder, compact }) {
  const [markdownMode, setMarkdownMode] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: placeholder || '내용을 입력하세요…' }),
    ],
    content: mdToHtml(value),
    onUpdate: ({ editor }) => onChangeRef.current(htmlToMd(editor.getHTML())),
  }, [placeholder])

  useEffect(() => {
    if (!editor || markdownMode) return

    const currentMd = htmlToMd(editor.getHTML())
    if (currentMd !== normalizeMd(value)) {
      editor.commands.setContent(mdToHtml(value))
    }
  }, [editor, markdownMode, value])

  const run = command => {
    if (!editor) return
    command()
    setTableOpen(false)
  }

  const active = (name, attrs) => Boolean(editor?.isActive(name, attrs))

  const toggleMarkdownMode = () => {
    const nextMode = !markdownMode
    setMarkdownMode(nextMode)
    setTableOpen(false)

    if (!nextMode && editor) {
      const currentMd = htmlToMd(editor.getHTML())
      if (currentMd !== normalizeMd(value)) {
        editor.commands.setContent(mdToHtml(value))
      }
    }
  }

  const insertTable = () => {
    if (!editor) return

    const rows = Math.max(1, Number(tableRows) || 3)
    const cols = Math.max(1, Number(tableCols) || 3)
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    setTableOpen(false)
  }

  return (
    <div className={`md-editor${compact ? ' compact' : ''}`}>
      <div className="md-toolbar" aria-label="Markdown editor toolbar">
        <ToolbarButton
          active={active('heading', { level: 1 })}
          onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          disabled={!editor}
          title="Heading 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          active={active('heading', { level: 2 })}
          onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          disabled={!editor}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={active('heading', { level: 3 })}
          onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
          disabled={!editor}
          title="Heading 3"
        >
          H3
        </ToolbarButton>
        <span className="md-toolbar-sep" />
        <ToolbarButton
          active={active('bold')}
          onClick={() => run(() => editor.chain().focus().toggleBold().run())}
          disabled={!editor}
          title="Bold"
        >
          Bold
        </ToolbarButton>
        <ToolbarButton
          active={active('italic')}
          onClick={() => run(() => editor.chain().focus().toggleItalic().run())}
          disabled={!editor}
          title="Italic"
        >
          Italic
        </ToolbarButton>
        <ToolbarButton
          active={active('strike')}
          onClick={() => run(() => editor.chain().focus().toggleStrike().run())}
          disabled={!editor}
          title="Strikethrough"
        >
          Strike
        </ToolbarButton>
        <ToolbarButton
          active={active('code')}
          onClick={() => run(() => editor.chain().focus().toggleCode().run())}
          disabled={!editor}
          title="Inline code"
        >
          Code
        </ToolbarButton>
        <span className="md-toolbar-sep" />
        <ToolbarButton
          active={active('bulletList')}
          onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}
          disabled={!editor}
          title="Bullet list"
        >
          Bullet
        </ToolbarButton>
        <ToolbarButton
          active={active('orderedList')}
          onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}
          disabled={!editor}
          title="Ordered list"
        >
          Ordered
        </ToolbarButton>
        <span className="md-table-control">
          <ToolbarButton
            active={active('table')}
            onClick={() => setTableOpen(open => !open)}
            disabled={!editor || markdownMode || editor.isActive('table')}
            title="Insert table"
          >
            Table
          </ToolbarButton>
          {tableOpen && (
            <div className="md-table-popover" role="dialog" aria-label="표 삽입">
              <label>
                <span>행</span>
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  max="20"
                  value={tableRows}
                  onChange={e => setTableRows(e.target.value)}
                />
              </label>
              <label>
                <span>열</span>
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  max="12"
                  value={tableCols}
                  onChange={e => setTableCols(e.target.value)}
                />
              </label>
              <button type="button" className="btn btn-xs btn-primary" onClick={insertTable}>
                삽입
              </button>
            </div>
          )}
        </span>
        <span className="md-toolbar-spacer" />
        <ToolbarButton
          active={markdownMode}
          onClick={toggleMarkdownMode}
          disabled={!editor}
          title="Raw markdown"
        >
          {'</> 마크다운'}
        </ToolbarButton>
      </div>

      {markdownMode ? (
        <textarea
          className="field-input md-raw-textarea"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '내용을 입력하세요…'}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  )
}

/**
 * @param {string}   value        markdown source string
 * @param {(md:string)=>void} onChange  called with markdown on every edit
 * @param {string}   [placeholder]
 * @param {boolean}  [enabled=true]  false -> render a plain textarea
 * @param {boolean}  [compact=false] smaller min-height + condensed toolbar
 */
export default function MarkdownEditor({ value, onChange, placeholder, enabled = true, compact = false }) {
  if (!enabled) {
    return (
      <MarkdownTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        compact={compact}
      />
    )
  }

  return (
    <TiptapMarkdownEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      compact={compact}
    />
  )
}
