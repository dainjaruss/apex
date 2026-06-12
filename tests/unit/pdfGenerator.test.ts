import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { generateEvalPdf } from '../../lib/pdfGenerator'
import { Evaluation } from '../../types'
import { PDFDocument } from 'pdf-lib'

const mockEvaluation: Evaluation = {
  id: 'test-eval-id',
  created_by: 'test-user-id',
  form_definition_id: 'EVAL',
  report_type: 'EVAL',
  member_name: 'DOE, JOHN A',
  dod_id: '1234567890',
  grade_rate: 'PO2',
  designator: '1110',
  period_from: '2025-01-01',
  period_to: '2025-12-31',
  duty_status: 'ACDU',
  uic: '12345',
  ship_station: 'USS NEVERSAIL',
  promotion_status: 'Regular',
  trait_grades: {
    knowledge: '4.0',
    work: '4.0',
    eo: '4.0',
    bearing: '4.0',
    accomplishment: '4.0',
    teamwork: '4.0',
    leadership: '4.0',
  },
  comments: 'PO2 DOE HAS PERFORMED OUTSTANDING DUTIES THROUGHOUT THIS CYCLE.',
  career_recommendations: ['NAVY RECRUITER', 'LPO'],
  promotion_recommendation: 'Must Promote',
  retention: 'Recommended',
  status: 'draft',
  block_values: {}
}

describe('APEX PDF Generator Unit Tests', () => {
  it('should successfully load the template, draw fields, and generate a valid PDF', async () => {
    const templatePath = path.join(process.cwd(), 'public', 'NAVPERS 1616-26 05-2025_Final.pdf')
    expect(fs.existsSync(templatePath)).toBe(true)
    
    const templateBuffer = new Uint8Array(fs.readFileSync(templatePath))
    const testDoc = await PDFDocument.load(templateBuffer)
    console.log('Template pages count:', testDoc.getPageCount())
    
    // Generate the PDF
    const pdfBytes = await generateEvalPdf(mockEvaluation, templateBuffer)
    
    // Validate output
    expect(pdfBytes).toBeDefined()
    expect(pdfBytes.length).toBeGreaterThan(0)
    
    // Re-parse output PDF to check it is valid and has pages
    const finalDoc = await PDFDocument.load(pdfBytes)
    expect(finalDoc.getPageCount()).toBe(2)
  })
})
