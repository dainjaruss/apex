// app/api/pdf/route.ts
//
// Next.js App Router POST handler for serving populated evaluation PDFs.
//

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { generateOverlayPdf } from "@/lib/pdfOverlay";

export async function POST(req: NextRequest) {
  try {
    const evaluation = await req.json();

    // Select the appropriate official blank template based on report_type.
    const reportType = evaluation.report_type || "EVAL";
    const templateName =
      reportType === "CHIEFEVAL"
        ? "chiefEvalBlank.pdf"
        : reportType === "FITREP"
          ? "fitrepBlank.pdf"
          : "navpers-1616-26_2025.pdf";

    const templatePath = path.join(
      process.cwd(),
      "public",
      templateName,
    );
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: `Evaluation template PDF (${templateName}) not found.` },
        { status: 500 },
      );
    }

    const templateBuffer = new Uint8Array(fs.readFileSync(templatePath));
    const pdfBytes = await generateOverlayPdf(evaluation, templateBuffer);

    const prefix = reportType === "FITREP" ? "FITREP" : reportType === "CHIEFEVAL" ? "CHIEFEVAL" : "EVAL";
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${prefix}_${(evaluation.member_name || "REPORT").replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("API PDF Generation Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate PDF." },
      { status: 500 },
    );
  }
}
