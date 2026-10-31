/* 개념노트를 앱 개념카드 화면(concept_detail_screen.dart)과 같은 규칙으로 그리는 폰 폭 미리보기 */
import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import './concept-phone-preview.css'
import { svgPreviewDataUri } from '../lib/concept-svg.js'
import { calculationLineLatex, groupCalculationFormula } from '../lib/calculation-formula.js'
import { normalizeTextMiddleDots, parseConceptPhoneBlocks, parseInlineMath, planConceptBodyLines } from '../lib/concept-phone-preview.js'

const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React

// 앱과 같은 값(폰 폭 402pt, 좌 20·우 44 여백)
const PHONE_WIDTH = 402
const CALCULATION_MINIMUM_SCALE = 0.85
const CALCULATION_CONTINUATION_INSET = 16
const NUMBER_SIZE = 22
const NUMBER_GAP = 8
const FORMULA_INSET = 12

function renderTex(expression, displayMode = false) {
  return katex.renderToString(normalizeTextMiddleDots(expression), { throwOnError: true, displayMode, output: 'html', strict: 'ignore' })
}

function TexSpan({ expression, source }) {
  const html = useMemo(() => {
    try { return renderTex(expression) } catch { return null }
  }, [expression])
  if (html == null) return <span className="cpp-tex-error">{source}</span>
  return <span className="cpp-tex" dangerouslySetInnerHTML={{ __html: html }}/>
}

function highlighted(text) {
  const parts = []
  const pattern = /==(.+?)==/g
  let last = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<mark key={match.index} className="cpp-mark">{match[1]}</mark>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// 수식이 섞인 한 줄: 앱처럼 줄바꿈 없이 한 줄로 두고 폭이 넘치면 통째로 줄인다.
function InlineMathText({ content, className = 'cpp-text' }) {
  return (
    <div className={className}>
      {parseInlineMath(content).map((part, index) => part.expression != null
        ? <span key={index} className="cpp-inline-math"><TexSpan expression={part.expression} source={part.source}/></span>
        : <span key={index}>{part.text.replace(/\\\$/g, '$')}</span>)}
    </div>
  )
}

function LatexLine({ content }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [fit, setFit] = useState({ scale: 1, height: undefined })
  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const natural = inner.scrollWidth
    const scale = natural > outer.clientWidth ? outer.clientWidth / natural : 1
    setFit({ scale, height: scale < 1 ? inner.offsetHeight * scale : undefined })
  }, [content])
  return (
    <div className="cpp-latex-line" ref={outerRef} style={{ height: fit.height }}>
      <div ref={innerRef} className="cpp-latex-line-inner" style={{ transform: `scale(${fit.scale})` }}>
        {parseInlineMath(content).map((part, index) => part.expression != null
          ? <TexSpan key={index} expression={part.expression} source={part.source}/>
          : <span key={index}>{part.text.replace(/\\\$/g, '$')}</span>)}
      </div>
    </div>
  )
}

const measureCache = new Map()
function measureTex(expression) {
  if (measureCache.has(expression)) return measureCache.get(expression)
  const probe = document.createElement('div')
  probe.className = 'cpp-measure'
  try { probe.innerHTML = renderTex(expression) } catch { probe.textContent = expression }
  document.body.appendChild(probe)
  const rect = probe.getBoundingClientRect()
  const size = { width: rect.width, height: rect.height }
  probe.remove()
  measureCache.set(expression, size)
  return size
}

function useFormulaLayout(expression, width) {
  return useMemo(() => {
    if (!(width > 0) || typeof document === 'undefined') return null
    const lines = groupCalculationFormula(expression, (line, continuation) => (
      measureTex(calculationLineLatex(line, continuation)).width * CALCULATION_MINIMUM_SCALE
        <= width - (continuation ? CALCULATION_CONTINUATION_INSET : 0)
    ))
    let scale = 1
    lines.forEach((line, index) => {
      const size = measureTex(calculationLineLatex(line, index > 0))
      const lineWidth = Math.max(0, width - (index === 0 ? 0 : CALCULATION_CONTINUATION_INSET))
      if (size.width > 0) scale = Math.min(scale, lineWidth / size.width)
    })
    scale = Math.min(1, Math.max(CALCULATION_MINIMUM_SCALE, scale))
    return { lines, scale }
  }, [expression, width])
}

function CalculationFormula({ content, description, number }) {
  const boxRef = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    setWidth(box.clientWidth - 2 * FORMULA_INSET)
  }, [])
  const expression = content.slice(1, -1)
  const layout = useFormulaLayout(expression, width)
  return (
    <div className="cpp-calc">
      <div className="cpp-calc-row">
        {number != null && <span className="cpp-calc-number">{number}</span>}
        <div className="cpp-calc-box" ref={boxRef} style={{ visibility: layout ? 'visible' : 'hidden' }}>
          {(layout?.lines || [expression]).map((line, index) => {
            const latex = calculationLineLatex(line, index > 0)
            const lineWidth = Math.max(0, width - (index === 0 ? 0 : CALCULATION_CONTINUATION_INSET))
            const size = layout ? measureTex(latex) : null
            const overflow = size && size.width * CALCULATION_MINIMUM_SCALE > lineWidth
            const scaled = (
              <span className="cpp-calc-scaled" style={size ? { width: size.width * layout.scale, height: size.height * layout.scale } : null}>
                <span style={{ transform: `scale(${layout?.scale ?? 1})` }}><TexSpan expression={latex} source={latex}/></span>
              </span>
            )
            return (
              <div key={index} className={'cpp-calc-line' + (overflow ? ' cpp-calc-overflow' : '')} style={{ marginLeft: index === 0 ? 0 : CALCULATION_CONTINUATION_INSET, marginTop: index === 0 ? 0 : 6, width: lineWidth || undefined }}>
                {scaled}
              </div>
            )
          })}
        </div>
      </div>
      {description != null
        ? <div className="cpp-calc-description" style={{ marginLeft: FORMULA_INSET + (number != null ? NUMBER_SIZE + NUMBER_GAP : 0) }}>
            {(description.match(/\$/g) || []).length >= 2 ? <InlineMathText content={description} className=""/> : highlighted(description)}
          </div>
        : <div style={{ height: 10 }}/>}
    </div>
  )
}

function ConceptBody({ text }) {
  return planConceptBodyLines(text).map((item, index) => {
    switch (item.type) {
      case 'blank': return <div key={index} style={{ height: 16 }}/>
      case 'heading': return (
        <div key={index} className="cpp-subheading" style={{ paddingTop: item.first ? 10 : 24 }}>
          <span>{item.text}</span>
        </div>
      )
      case 'formula': return <CalculationFormula key={index} content={item.content} description={item.description} number={item.number}/>
      case 'latex': return <LatexLine key={index} content={item.text}/>
      case 'inline': return <InlineMathText key={index} content={item.text}/>
      default: return <div key={index} className="cpp-text">{highlighted(item.text)}</div>
    }
  })
}

function PhoneTable({ rows, hasHeader }) {
  return (
    <div className="cpp-table-wrap">
      <table className="cpp-table">
        <tbody>
          {rows.map((row, rowIndex) => {
            const header = rowIndex < rows.headerRows
            return (
              <tr key={rowIndex} className={header ? 'cpp-table-head' : ''}>
                {row.map(cell => cell && React.createElement(header && hasHeader ? 'th' : 'td', {
                  key: cell.column, colSpan: cell.colSpan, rowSpan: cell.rowSpan,
                }, cell.lines.map((line, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br/>}{line}</React.Fragment>)))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ExamPoint({ text }) {
  return String(text).split(/\r?\n/).map((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return <div key={index} style={{ height: 16 }}/>
    const heading = trimmed.match(/^\*\*(.+)\*\*$/)
    if (heading) return <div key={index} className="cpp-text" style={{ fontWeight: 700 }}>{heading[1]}</div>
    const marker = trimmed[0]
    if (marker === '○' || marker === '×') {
      return (
        <div key={index} className="cpp-exam-row">
          <span className={marker === '○' ? 'cpp-correct' : 'cpp-incorrect'}>{marker}</span>
          <span>{trimmed.slice(1).trimStart()}</span>
        </div>
      )
    }
    return <div key={index} className="cpp-text">{trimmed}</div>
  })
}

export default function ConceptPhonePreview({ concept, theme = 'light' }) {
  const definition = String(concept.definition || '').trim() || '등록된 개념 설명이 없습니다.'
  const examPoint = String(concept.exam_point || '').trim()
  const realLife = String(concept.real_life_example || '').trim()
  const laws = Array.isArray(concept.related_laws) ? concept.related_laws : []
  const blocks = useMemo(() => parseConceptPhoneBlocks(definition), [definition])
  // KaTeX 글꼴이 늦게 오면 공식 폭을 다시 잰다.
  const [fontGeneration, setFontGeneration] = useState(0)
  useEffect(() => {
    let alive = true
    document.fonts?.ready?.then(() => {
      if (!alive) return
      measureCache.clear()
      setFontGeneration(generation => generation + 1)
    })
    return () => { alive = false }
  }, [])
  return (
    <div className={'cpp-phone cpp-' + theme} style={{ width: PHONE_WIDTH }}>
      <div className="cpp-appbar"><span className="cpp-back">‹</span>개념 노트</div>
      <div className="cpp-scroll">
        <div className="cpp-card">
          <div className="cpp-title">{concept.title || '(제목 없는 개념)'}</div>
          <div className="cpp-section-label">핵심 개념</div>
          <div className="cpp-body" key={fontGeneration}>
            {blocks.map((block, index) => block.type === 'table'
              ? <PhoneTable key={index} rows={block.rows} hasHeader={block.hasHeader}/>
              : block.type === 'svg'
                ? <div key={index} className="cpp-svg"><img src={svgPreviewDataUri(block.svg, { theme })} alt=""/></div>
                : <ConceptBody key={index} text={block.text}/>)}
          </div>
          {examPoint && (
            <>
              <div className="cpp-section-label" style={{ marginTop: 24 }}>기출 함정</div>
              <div className="cpp-body"><ExamPoint text={examPoint}/></div>
            </>
          )}
          {realLife && (
            <>
              <div className="cpp-section-label cpp-blue" style={{ marginTop: 24 }}>실생활 예시</div>
              <div className="cpp-postit">{realLife}</div>
            </>
          )}
          {laws.length > 0 && (
            <div className="cpp-laws">
              <div className="cpp-laws-title">관련 법령</div>
              <div className="cpp-law-chips">{laws.map((law, index) => <span key={index} className="cpp-law-chip">{law?.title || `조문 ${index + 1}`}</span>)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

