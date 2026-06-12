// app/api/pdf/route.ts
//
// Next.js App Router POST handler for serving populated evaluation PDFs.
//

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { generateEvalPdf } from '@/lib/pdfGenerator'

export async function POST(req: NextRequest) {
  try {
    const evaluation = await req.json()
    
    // Retrieve standard template path
    const templatePath = path.join(process.cwd(), 'public', 'NAVPERS 1616-26 05-2025_Final.pdf')
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Evaluation template PDF not found.' }, { status: 500 })
    }
    
    const templateBuffer = new Uint8Array(fs.readFileSync(templatePath))
    const pdfBytes = await generateEvalPdf(evaluation, templateBuffer)
    
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="EVAL_${(evaluation.member_name || 'REPORT').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('API PDF Generation Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate PDF.' }, { status: 500 })
  }
}
