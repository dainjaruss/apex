// lib/commentFit.ts
//
// Comment-fit validation matching NAVFIT98A 10/12-pitch Courier capacity (EVALMAN Ch 13).
//

export interface CommentFitResult {
  fit: boolean;
  linesUsed: number;
  maxLines: number;
  charsPerLine: number;
  wrappedLines: string[];
}

/**
 * Wraps text into lines based on a maximum characters-per-line constraint.
 * Preserves explicit newlines and handles words longer than the line width by force-splitting.
 */

function wrapText(text: string, charsPerLine: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (word === '') {
        // Handle multiple sequential spaces
        currentLine += ' ';
        continue;
      }

      if (currentLine.length === 0) {
        let remaining = word;
        while (remaining.length > charsPerLine) {
          lines.push(remaining.substring(0, charsPerLine));
          remaining = remaining.substring(charsPerLine);
        }
        currentLine = remaining;
      } else {
        const spacing = currentLine.endsWith(' ') ? '' : ' ';
        const potentialLength = currentLine.length + spacing.length + word.length;
        
        if (potentialLength <= charsPerLine) {
          currentLine += spacing + word;
        } else {
          lines.push(currentLine);
          let remaining = word;
          while (remaining.length > charsPerLine) {
            lines.push(remaining.substring(0, charsPerLine));
            remaining = remaining.substring(charsPerLine);
          }
          currentLine = remaining;
        }
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Checks whether the given text fits in Block 43 comments space (18 lines maximum)
 * under the selected Courier New character pitch (10-pitch = 70 CPL, 12-pitch = 84 CPL).
 */
export function checkCommentFit(text: string, pitch: '10' | '12' | 10 | 12): CommentFitResult {
  const maxLines = 18;
  const charsPerLine = Number(pitch) === 12 ? 84 : 70;

  if (!text) {
    return {
      fit: true,
      linesUsed: 0,
      maxLines,
      charsPerLine,
      wrappedLines: []
    };
  }

  const wrappedLines = wrapText(text, charsPerLine);

  return {
    fit: wrappedLines.length <= maxLines,
    linesUsed: wrappedLines.length,
    maxLines,
    charsPerLine,
    wrappedLines
  };
}
