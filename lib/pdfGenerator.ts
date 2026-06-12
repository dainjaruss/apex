// lib/pdfGenerator.ts
//
// High-fidelity PDF generation overlay for NAVPERS 1616/26 EVAL forms.
// Links to governing directive: BUPERSINST 1610.10H.
//

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Evaluation } from '@/types'
import { runFullValidation } from './validationEngine'

/**
 * Maps standard duty status strings to X coordinates on Page 1 Block 5
 */
function getDutyStatusX(status: string): number | null {
  const normalized = status.toUpperCase().trim()
  if (normalized.includes('ACDU')) return 432
  if (normalized.includes('TAR')) return 471
  if (normalized.includes('INACT')) return 510
  if (normalized.includes('AT/ADOS') || normalized.includes('AT-ADOS')) return 549
  return null
}

/**
 * Maps standard promotion status strings to X coordinates on Page 1 Block 8
 */
function getPromotionStatusX(status: string): number | null {
  const normalized = status.toUpperCase().trim()
  if (normalized.includes('REGULAR')) return 223
  if (normalized.includes('FROCKED')) return 269
  if (normalized.includes('SELECTED')) return 317
  if (normalized.includes('SPOT')) return 363
  return null
}

/**
 * Maps promotion recommendation strings to X coordinates on Page 2 Block 45
 */
function getPromotionRecommendationX(rec: string): number | null {
  const normalized = rec.toUpperCase().trim()
  if (normalized.includes('EARLY') || normalized.includes('EP')) return 328
  if (normalized.includes('MUST') || normalized.includes('MP')) return 374
  if (normalized.includes('PROMOTABLE') || normalized.includes('P')) return 420
  if (normalized.includes('PROGRESSING')) return 466
  if (normalized.includes('SIGNIFICANT')) return 512
  if (normalized.includes('NOB')) return 558
  return null
}

/**
 * Formats a date string (YYYY-MM-DD) into NAVPERS format (YYMMMDD / YYMMDD)
 */
function formatNavpersDate(dateStr?: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  const yy = String(date.getFullYear()).slice(-2)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const mmm = months[date.getMonth()]
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mmm}${dd}`
}

/**
 * Word wraps text based on max character-per-line length.
 */
function wrapCommentsText(text: string, maxCpl = 80): string[] {
  const paragraphs = text.split('\n')
  const lines: string[] = []

  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('')
      continue
    }

    const words = para.split(' ')
    let currentLine = ''

    for (const word of words) {
      if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxCpl) {
        currentLine += (currentLine ? ' ' : '') + word
      } else {
        if (currentLine) lines.push(currentLine)
        currentLine = word
      }
    }
    if (currentLine) lines.push(currentLine)
  }
  return lines
}

/**
 * Populates evaluation data on top of a blank NAVPERS 1616/26 PDF template.
 * @param evaluation The evaluation data record
 * @param templateBuffer Binary buffer of BUPERSINST 1610.10H / NAVPERS 1616-26 05-2025_Final.pdf
 */
// fallow-ignore-next-line complexity
export async function generateEvalPdf(evaluation: Evaluation, templateBuffer: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBuffer)
  
  // Ensure the document has exactly 2 pages
  while (pdfDoc.getPageCount() < 2) {
    pdfDoc.addPage([612, 792])
  }

  const pages = pdfDoc.getPages()
  const page1 = pages[0]
  const page2 = pages[1]

  // Embed standard fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const courier = await pdfDoc.embedFont(StandardFonts.Courier)

  // Color configurations
  const blackColor = rgb(0.05, 0.05, 0.05)
  const greyColor = rgb(0.5, 0.5, 0.5)
  const lightGrey = rgb(0.9, 0.9, 0.9)

  // Draw background grids and labels if the PDF is a dynamic XFA form (detected by 1 original page)
  const isXfaTemplate = pages.length === 1 || templateBuffer.byteLength < 20000

  if (isXfaTemplate) {
    // --- DRAW STRUCTURAL LAYOUT ON PAGE 1 ---
    // Outer Border
    page1.drawRectangle({
      x: 36,
      y: 36,
      width: 540,
      height: 720,
      borderColor: blackColor,
      borderWidth: 1.5,
    })

    // Header Title Block
    page1.drawRectangle({
      x: 36,
      y: 726,
      width: 540,
      height: 30,
      color: lightGrey,
      borderColor: blackColor,
      borderWidth: 1,
    })
    page1.drawText('EVALUATION REPORT AND COUNSELING RECORD (E1-E6)', {
      x: 130,
      y: 737,
      size: 11,
      font: helveticaBold,
      color: blackColor,
    })
    page1.drawText('NAVPERS 1616/26 (REV. 05-2025)', {
      x: 440,
      y: 738,
      size: 7,
      font: helveticaBold,
      color: blackColor,
    })

    // Row 1 (Blocks 1-6) Grid Lines and Labels
    // Draw horizontal separator line for Row 1
    page1.drawLine({ start: { x: 36, y: 700 }, end: { x: 576, y: 700 }, color: blackColor, thickness: 1 })
    // Vertical dividers
    page1.drawLine({ start: { x: 230, y: 700 }, end: { x: 230, y: 726 }, color: blackColor, thickness: 1 })
    page1.drawLine({ start: { x: 284, y: 700 }, end: { x: 284, y: 726 }, color: blackColor, thickness: 1 })
    page1.drawLine({ start: { x: 340, y: 700 }, end: { x: 340, y: 726 }, color: blackColor, thickness: 1 })
    page1.drawLine({ start: { x: 420, y: 700 }, end: { x: 420, y: 726 }, color: blackColor, thickness: 1 })
    page1.drawLine({ start: { x: 512, y: 700 }, end: { x: 512, y: 726 }, color: blackColor, thickness: 1 })

    // Block Labels
    page1.drawText('1. NAME (LAST, FIRST, MI, SUFFIX)', { x: 40, y: 719, size: 6, font: helveticaBold, color: greyColor })
    page1.drawText('2. GRADE/RATE', { x: 233, y: 719, size: 6, font: helveticaBold, color: greyColor })
    page1.drawText('3. DESIG', { x: 287, y: 719, size: 6, font: helveticaBold, color: greyColor })
    page1.drawText('4. DOD ID', { x: 343, y: 719, size: 6, font: helveticaBold, color: greyColor })
    page1.drawText('5. DUTY STATUS', { x: 423, y: 719, size: 6, font: helveticaBold, color: greyColor })
    page1.drawText('6. UIC', { x: 515, y: 719, size: 6, font: helveticaBold, color: greyColor })

    // Row 2 (Blocks 7-8)
    page1.drawLine({ start: { x: 36, y: 680 }, end: { x: 576, y: 680 }, color: blackColor, thickness: 1 })
    page1.drawLine({ start: { x: 216, y: 680 }, end: { x: 216, y: 700 }, color: blackColor, thickness: 1 })
    page1.drawText('7. SHIP/STATION', { x: 40, y: 693, size: 6, font: helveticaBold, color: greyColor })
    page1.drawText('8. PROMOTION STATUS', { x: 219, y: 693, size: 6, font: helveticaBold, color: greyColor })

    // Row 3 (Blocks 14-15 Period of Report)
    page1.drawLine({ start: { x: 36, y: 658 }, end: { x: 576, y: 658 }, color: blackColor, thickness: 1 })
    page1.drawLine({ start: { x: 130, y: 658 }, end: { x: 130, y: 680 }, color: blackColor, thickness: 1 })
    page1.drawText('14. PERIOD FROM', { x: 40, y: 672, size: 6, font: helveticaBold, color: greyColor })
    page1.drawText('15. PERIOD TO', { x: 133, y: 672, size: 6, font: helveticaBold, color: greyColor })

    // --- Performance Traits Grid Header & Row Borders (33-39) ---
    page1.drawRectangle({
      x: 36,
      y: 508,
      width: 540,
      height: 18,
      color: lightGrey,
      borderColor: blackColor,
      borderWidth: 1,
    })
    page1.drawText('33-39. PERFORMANCE TRAITS', { x: 40, y: 514, size: 8, font: helveticaBold, color: blackColor })
    page1.drawText('1.0', { x: 350, y: 514, size: 7, font: helveticaBold, color: blackColor })
    page1.drawText('2.0', { x: 378, y: 514, size: 7, font: helveticaBold, color: blackColor })
    page1.drawText('3.0', { x: 406, y: 514, size: 7, font: helveticaBold, color: blackColor })
    page1.drawText('4.0', { x: 434, y: 514, size: 7, font: helveticaBold, color: blackColor })
    page1.drawText('5.0', { x: 462, y: 514, size: 7, font: helveticaBold, color: blackColor })
    page1.drawText('NOB', { x: 490, y: 514, size: 7, font: helveticaBold, color: blackColor })

    // Draw horizontal grid lines for each trait
    const traitKeys = ['knowledge', 'work', 'eo', 'bearing', 'accomplishment', 'teamwork', 'leadership']
    const traitLabels = [
      '33. Professional Knowledge',
      '34. Quality of Work',
      '35. Equal Opportunity / Climate',
      '36. Military Bearing / Character',
      '37. Personal Job Accomplishment',
      '38. Teamwork',
      '39. Leadership',
    ]

    traitKeys.forEach((key, i) => {
      const yLine = 508 - (i + 1) * 22
      page1.drawLine({ start: { x: 36, y: yLine }, end: { x: 576, y: yLine }, color: blackColor, thickness: 0.5 })
      page1.drawText(traitLabels[i], { x: 40, y: yLine + 7, size: 7, font: helvetica, color: blackColor })
    })

    // Divider line for Trait Average
    page1.drawLine({ start: { x: 36, y: 324 }, end: { x: 576, y: 324 }, color: blackColor, thickness: 1 })
    page1.drawText('40. INDIVIDUAL TRAIT AVERAGE', { x: 40, y: 332, size: 7, font: helveticaBold, color: blackColor })


    // --- DRAW STRUCTURAL LAYOUT ON PAGE 2 ---
    // Outer Border
    page2.drawRectangle({
      x: 36,
      y: 36,
      width: 540,
      height: 720,
      borderColor: blackColor,
      borderWidth: 1.5,
    })

    // Header Title Block Page 2
    page2.drawRectangle({
      x: 36,
      y: 726,
      width: 540,
      height: 30,
      color: lightGrey,
      borderColor: blackColor,
      borderWidth: 1,
    })
    page2.drawText('NAVPERS 1616/26 (E1-E6) EVAL - REVERSE / WORKFLOW', {
      x: 130,
      y: 737,
      size: 11,
      font: helveticaBold,
      color: blackColor,
    })

    // Block 41: Career Recommendations Box
    page2.drawRectangle({
      x: 36,
      y: 670,
      width: 540,
      height: 36,
      borderColor: blackColor,
      borderWidth: 1,
    })
    page2.drawText('41. CAREER RECOMMENDATIONS', { x: 40, y: 694, size: 7, font: helveticaBold, color: greyColor })

    // Block 43: Comments Header and Outline
    page2.drawRectangle({
      x: 36,
      y: 320,
      width: 540,
      height: 330,
      borderColor: blackColor,
      borderWidth: 1.5,
    })
    page2.drawRectangle({
      x: 36,
      y: 632,
      width: 540,
      height: 18,
      color: lightGrey,
      borderColor: blackColor,
      borderWidth: 1,
    })
    page2.drawText('43. COMMENTS ON PERFORMANCE', { x: 40, y: 638, size: 8, font: helveticaBold, color: blackColor })

    // Draw reference lines inside comments box
    for (let i = 0; i < 18; i++) {
      const lineY = 574 - i * 13.5 - 2
      page2.drawLine({
        start: { x: 50, y: lineY },
        end: { x: 562, y: lineY },
        color: rgb(0.85, 0.85, 0.85),
        thickness: 0.5,
      })
    }

    // Block 45: Promotion Recommendation Block
    page2.drawRectangle({
      x: 36,
      y: 275,
      width: 540,
      height: 30,
      borderColor: blackColor,
      borderWidth: 1,
    })
    page2.drawText('45. PROMOTION RECOMMENDATION (EP / MP / P / PROGRESSING / SUB STANDARD / NOB)', {
      x: 40,
      y: 295,
      size: 7,
      font: helveticaBold,
      color: greyColor,
    })

    // Block 47: Retention Block
    page2.drawRectangle({
      x: 36,
      y: 240,
      width: 540,
      height: 25,
      borderColor: blackColor,
      borderWidth: 1,
    })
    page2.drawText('47. RETENTION RECOMMENDATION (RECOMMEND / NOT RECOMMEND)', {
      x: 40,
      y: 253,
      size: 7,
      font: helveticaBold,
      color: greyColor,
    })
  }

  // --- PAGE 1: ADMINISTRATIVE IDENTITY ---
  // Block 1: Name
  page1.drawText((evaluation.member_name || '').toUpperCase(), {
    x: 54,
    y: 712,
    size: 8,
    font: helvetica,
    color: blackColor,
  })

  // Block 2: Grade/Rate
  page1.drawText((evaluation.grade_rate || '').toUpperCase(), {
    x: 236,
    y: 712,
    size: 8,
    font: helvetica,
    color: blackColor,
  })

  // Block 3: Designator
  page1.drawText(evaluation.designator || '', {
    x: 290,
    y: 712,
    size: 8,
    font: helvetica,
    color: blackColor,
  })

  // Block 4: DoD ID
  page1.drawText(evaluation.dod_id || '', {
    x: 348,
    y: 712,
    size: 8,
    font: courier,
    color: blackColor,
  })

  // Block 5: Duty Status Checkboxes
  const dutyX = getDutyStatusX(evaluation.duty_status || '')
  if (dutyX) {
    page1.drawText('X', {
      x: dutyX,
      y: 712,
      size: 9,
      font: helveticaBold,
      color: blackColor,
    })
  }

  // Block 6: UIC
  page1.drawText(evaluation.uic || '', {
    x: 520,
    y: 712,
    size: 8,
    font: courier,
    color: blackColor,
  })

  // Block 7: Ship/Station
  page1.drawText((evaluation.ship_station || '').toUpperCase(), {
    x: 54,
    y: 691,
    size: 8,
    font: helvetica,
    color: blackColor,
  })

  // Block 8: Promotion Status Checkboxes
  const promoX = getPromotionStatusX(evaluation.promotion_status || '')
  if (promoX) {
    page1.drawText('X', {
      x: promoX,
      y: 691,
      size: 9,
      font: helveticaBold,
      color: blackColor,
    })
  }

  // Block 14-15: Period of Report
  page1.drawText(formatNavpersDate(evaluation.period_from), {
    x: 54,
    y: 670,
    size: 8,
    font: courier,
    color: blackColor,
  })

  page1.drawText(formatNavpersDate(evaluation.period_to), {
    x: 140,
    y: 670,
    size: 8,
    font: courier,
    color: blackColor,
  })

  // --- PAGE 1: BLOCKS 33 - 39 TRAIT GRADES ---
  // Coordinates mapping grid for traits:
  // Trait rows: professional knowledge, quality of work, equal opportunity, military bearing, personal job accomplishment, teamwork, leadership.
  const traitRowKeys: (keyof typeof evaluation.trait_grades)[] = [
    'knowledge',
    'work',
    'eo',
    'bearing',
    'accomplishment',
    'teamwork',
    'leadership',
  ]

  // Y-coordinates measured for rows 33-39 (offset descending)
  const traitYMap: Record<string, number> = {
    knowledge: 494,
    work: 472,
    eo: 450,
    bearing: 428,
    accomplishment: 406,
    teamwork: 384,
    leadership: 362,
  }

  // X-coordinates corresponding to grade values (1.0, 2.0, 3.0, 4.0, 5.0, NOB)
  const traitXMap: Record<string, number> = {
    '1.0': 354,
    '2.0': 382,
    '3.0': 410,
    '4.0': 438,
    '5.0': 466,
    'NOB': 494,
  }

  traitRowKeys.forEach((key) => {
    const grade = evaluation.trait_grades?.[key]
    if (grade) {
      const xCoord = traitXMap[grade]
      const yCoord = traitYMap[key]
      if (xCoord && yCoord) {
        page1.drawText('X', {
          x: xCoord,
          y: yCoord,
          size: 9,
          font: helveticaBold,
          color: blackColor,
        })
      }
    }
  })

  // Block 40: Individual Trait Average
  if (evaluation.trait_average !== undefined) {
    page1.drawText(evaluation.trait_average.toFixed(2), {
      x: 410,
      y: 334,
      size: 9,
      font: helveticaBold,
      color: blackColor,
    })
  }

  // --- PAGE 2: WORKFLOW & COMMENTS ---
  // Block 41: Career Recommendations (Maximum two, formatted onto two separate lines)
  const careerRecs = evaluation.career_recommendations || []
  if (careerRecs.length > 0) {
    page2.drawText((careerRecs[0] || '').toUpperCase(), {
      x: 54,
      y: 686,
      size: 8,
      font: helvetica,
      color: blackColor,
    })
  }
  if (careerRecs.length > 1) {
    page2.drawText((careerRecs[1] || '').toUpperCase(), {
      x: 180,
      y: 686,
      size: 8,
      font: helvetica,
      color: blackColor,
    })
  }

  // Block 43: Comments on Performance
  // Limits: 18 lines max, 80 characters per line (Courier Monospace)
  const rawComments = evaluation.comments || ''
  const wrappedLines = wrapCommentsText(rawComments, 80)
  
  // Starting coordinates for Comments block on Page 2
  const startCommentY = 574
  const lineSpacing = 13.5

  wrappedLines.slice(0, 18).forEach((line, index) => {
    page2.drawText(line, {
      x: 54,
      y: startCommentY - index * lineSpacing,
      size: 9,
      font: courier,
      color: blackColor,
    })
  })

  // Block 45: Promotion Recommendation Checkboxes
  const recX = getPromotionRecommendationX(evaluation.promotion_recommendation || '')
  if (recX) {
    page2.drawText('X', {
      x: recX,
      y: 288,
      size: 9,
      font: helveticaBold,
      color: blackColor,
    })
  }

  // Block 47: Retention Recommendation
  const retention = (evaluation.retention || '').toUpperCase()
  if (retention.includes('NOT')) {
    // Check "Not Recommended" box
    page2.drawText('X', {
      x: 236,
      y: 260,
      size: 9,
      font: helveticaBold,
      color: blackColor,
    })
  } else if (retention.includes('RECOMMENDED') || retention === 'YES') {
    // Check "Recommend" box
    page2.drawText('X', {
      x: 140,
      y: 260,
      size: 9,
      font: helveticaBold,
      color: blackColor,
    })
  }

  // Serialize the PDF document to bytes
  return await pdfDoc.save()
}
